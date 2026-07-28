import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import type { BusinessDatabase, MembershipContext } from "@foode/db";
import type { MembershipRole } from "@foode/shared";

const optionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const complementGroupCreateSchema = z.object({
  itemId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  options: z.array(optionSchema).max(40),
  required: z.boolean(),
});

const complementGroupReplaceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  options: z.array(optionSchema).max(40),
  required: z.boolean().optional(),
});

const complementGroupReorderSchema = z.object({
  itemId: z.uuid(),
  orderedGroupIds: z.array(z.uuid()).min(1),
});

const additionalCreateSchema = z.object({
  available: z.boolean().optional(),
  itemId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0).max(100_000_000),
});

const additionalUpdateSchema = z
  .object({
    available: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
  })
  .refine(
    (value) =>
      value.available !== undefined ||
      value.name !== undefined ||
      value.priceCents !== undefined,
    { message: "empty_update" },
  );

const additionalReorderSchema = z.object({
  itemId: z.uuid(),
  orderedAdditionalIds: z.array(z.uuid()).min(1),
});

type RegisterMenuCustomizationRoutesOptions = {
  businessDatabase: BusinessDatabase;
  requireMembership: (
    request: FastifyRequest,
    reply: FastifyReply,
    requiredRole?: MembershipRole,
  ) => Promise<MembershipContext | undefined>;
};

export function registerMenuCustomizationRoutes(
  app: FastifyInstance,
  options: RegisterMenuCustomizationRoutesOptions,
) {
  const { businessDatabase, requireMembership } = options;

  app.post<{ Body: unknown }>(
    "/menu/complement-groups",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = complementGroupCreateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_complement_group" });
      }

      try {
        const group = await businessDatabase.createComplementGroup(
          context,
          body.data,
        );
        if (!group) {
          return reply.code(404).send({ error: "item_not_found" });
        }
        return reply.code(201).send({ group });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "required_group_needs_options" ||
            error.message === "duplicate_complement_options")
        ) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.put<{ Body: unknown }>("/menu/complement-groups/order", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = complementGroupReorderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_complement_group_order" });
    }

    const groups = await businessDatabase.reorderComplementGroups(
      context,
      body.data.itemId,
      body.data.orderedGroupIds,
    );
    if (!groups) {
      return reply.code(400).send({ error: "invalid_complement_group_order" });
    }
    return reply.code(200).send({ groups });
  });

  app.put<{ Body: unknown; Params: { groupId: string } }>(
    "/menu/complement-groups/:groupId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = complementGroupReplaceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_complement_group" });
      }

      try {
        const group = await businessDatabase.replaceComplementGroup(
          context,
          request.params.groupId,
          {
            options: body.data.options,
            ...(body.data.name === undefined ? {} : { name: body.data.name }),
            ...(body.data.required === undefined
              ? {}
              : { required: body.data.required }),
          },
        );
        if (!group) {
          return reply.code(404).send({ error: "complement_group_not_found" });
        }
        return reply.code(200).send({ group });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "required_group_needs_options" ||
            error.message === "duplicate_complement_options")
        ) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { groupId: string } }>(
    "/menu/complement-groups/:groupId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const deleted = await businessDatabase.deleteComplementGroup(
        context,
        request.params.groupId,
      );
      if (!deleted) {
        return reply.code(404).send({ error: "complement_group_not_found" });
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Body: unknown }>("/menu/additionals", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = additionalCreateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_additional" });
    }

    try {
      const additional = await businessDatabase.createAdditional(context, {
        itemId: body.data.itemId,
        name: body.data.name,
        priceCents: body.data.priceCents,
        ...(body.data.available === undefined
          ? {}
          : { available: body.data.available }),
      });
      if (!additional) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      return reply.code(201).send({ additional });
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_price_cents") {
        return reply.code(400).send({ error: "invalid_additional" });
      }
      throw error;
    }
  });

  app.put<{ Body: unknown }>("/menu/additionals/order", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = additionalReorderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_additional_order" });
    }

    const additionals = await businessDatabase.reorderAdditionals(
      context,
      body.data.itemId,
      body.data.orderedAdditionalIds,
    );
    if (!additionals) {
      return reply.code(400).send({ error: "invalid_additional_order" });
    }
    return reply.code(200).send({ additionals });
  });

  app.patch<{ Body: unknown; Params: { additionalId: string } }>(
    "/menu/additionals/:additionalId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = additionalUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_additional" });
      }

      try {
        const additional = await businessDatabase.updateAdditional(
          context,
          request.params.additionalId,
          {
            ...(body.data.available === undefined
              ? {}
              : { available: body.data.available }),
            ...(body.data.name === undefined ? {} : { name: body.data.name }),
            ...(body.data.priceCents === undefined
              ? {}
              : { priceCents: body.data.priceCents }),
          },
        );
        if (!additional) {
          return reply.code(404).send({ error: "additional_not_found" });
        }
        return reply.code(200).send({ additional });
      } catch (error) {
        if (error instanceof Error && error.message === "invalid_price_cents") {
          return reply.code(400).send({ error: "invalid_additional" });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { additionalId: string } }>(
    "/menu/additionals/:additionalId",
    async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const deleted = await businessDatabase.deleteAdditional(
        context,
        request.params.additionalId,
      );
      if (!deleted) {
        return reply.code(404).send({ error: "additional_not_found" });
      }
      return reply.code(204).send();
    },
  );
}
