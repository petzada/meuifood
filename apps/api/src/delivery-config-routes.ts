import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import type { BusinessDatabase, MembershipContext } from "@foode/db";

type RequireMembership = (
  request: FastifyRequest,
  reply: FastifyReply,
  requiredRole?: "owner" | "operator",
) => Promise<MembershipContext | undefined>;

const pickupSchema = z.object({
  pickupEnabled: z.boolean(),
});

const feeModeSchema = z.discriminatedUnion("mode", [
  z.object({
    fixedDeliveryFeeCents: z.number().int().min(0),
    mode: z.literal("fixed"),
  }),
  z.object({
    mode: z.literal("neighborhood"),
  }),
  z.object({
    mode: z.null(),
  }),
]);

const neighborhoodCreateSchema = z.object({
  feeCents: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
});

const neighborhoodUpdateSchema = z
  .object({
    feeCents: z.number().int().min(0).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.feeCents !== undefined || value.name !== undefined, {
    message: "empty_patch",
  });

const reorderSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(200),
});

export function registerDeliveryConfigRoutes(
  app: FastifyInstance,
  {
    businessDatabase,
    requireMembership,
  }: {
    businessDatabase: BusinessDatabase;
    requireMembership: RequireMembership;
  },
) {
  app.get("/delivery", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const delivery = await businessDatabase.getStoreDeliveryConfig(context);
    return reply.code(200).send({ delivery });
  });

  app.put<{ Body: unknown }>("/delivery/pickup", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = pickupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_pickup" });
    }

    const delivery = await businessDatabase.setStorePickupEnabled(
      context,
      body.data.pickupEnabled,
    );
    return reply.code(200).send({ delivery });
  });

  app.put<{ Body: unknown }>("/delivery/fee-mode", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = feeModeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_fee_mode" });
    }

    try {
      const delivery = await businessDatabase.setStoreDeliveryFeeMode(
        context,
        body.data,
      );
      return reply.code(200).send({ delivery });
    } catch {
      return reply.code(400).send({ error: "invalid_fee_mode" });
    }
  });

  app.post<{ Body: unknown }>("/delivery/neighborhoods", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = neighborhoodCreateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_neighborhood" });
    }

    const result = await businessDatabase.createDeliveryNeighborhood(
      context,
      body.data,
    );
    if (result.kind === "invalid") {
      return reply.code(400).send({ error: "invalid_neighborhood" });
    }
    if (result.kind === "duplicate") {
      return reply.code(409).send({ error: "neighborhood_duplicate" });
    }
    return reply.code(201).send({ neighborhood: result.neighborhood });
  });

  app.patch<{ Body: unknown; Params: { neighborhoodId: string } }>(
    "/delivery/neighborhoods/:neighborhoodId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const neighborhoodId = z.uuid().safeParse(request.params.neighborhoodId);
      if (!neighborhoodId.success) {
        return reply.code(404).send({ error: "neighborhood_not_found" });
      }

      const body = neighborhoodUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_neighborhood" });
      }

      const patch: { feeCents?: number; name?: string } = {};
      if (body.data.feeCents !== undefined) patch.feeCents = body.data.feeCents;
      if (body.data.name !== undefined) patch.name = body.data.name;

      const result = await businessDatabase.updateDeliveryNeighborhood(
        context,
        neighborhoodId.data,
        patch,
      );
      if (result.kind === "invalid") {
        return reply.code(404).send({ error: "neighborhood_not_found" });
      }
      if (result.kind === "duplicate") {
        return reply.code(409).send({ error: "neighborhood_duplicate" });
      }
      return reply.code(200).send({ neighborhood: result.neighborhood });
    },
  );

  app.delete<{ Params: { neighborhoodId: string } }>(
    "/delivery/neighborhoods/:neighborhoodId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const neighborhoodId = z.uuid().safeParse(request.params.neighborhoodId);
      if (!neighborhoodId.success) {
        return reply.code(404).send({ error: "neighborhood_not_found" });
      }

      const deleted = await businessDatabase.deleteDeliveryNeighborhood(
        context,
        neighborhoodId.data,
      );
      if (!deleted) {
        return reply.code(404).send({ error: "neighborhood_not_found" });
      }
      return reply.code(204).send();
    },
  );

  app.put<{ Body: unknown }>("/delivery/neighborhoods/order", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = reorderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_neighborhood_order" });
    }

    const neighborhoods = await businessDatabase.reorderDeliveryNeighborhoods(
      context,
      body.data.orderedIds,
    );
    if (!neighborhoods) {
      return reply.code(400).send({ error: "invalid_neighborhood_order" });
    }
    return reply.code(200).send({ neighborhoods });
  });
}
