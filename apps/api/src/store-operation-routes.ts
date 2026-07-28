import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import type { BusinessDatabase, MembershipContext } from "@foode/db";

import {
  type OperatingPeriod,
  validateOperatingPeriods,
} from "./store-operation.js";

type RequireMembership = (
  request: FastifyRequest,
  reply: FastifyReply,
  requiredRole?: "owner" | "operator",
) => Promise<MembershipContext | undefined>;

const periodSchema = z.object({
  closesAt: z.string(),
  opensAt: z.string(),
  weekday: z.number().int(),
});

const scheduleSchema = z.object({
  periods: z.array(periodSchema),
});

const pauseSchema = z.object({
  paused: z.boolean(),
});

export function registerStoreOperationRoutes(
  app: FastifyInstance,
  {
    businessDatabase,
    requireMembership,
  }: {
    businessDatabase: BusinessDatabase;
    requireMembership: RequireMembership;
  },
) {
  app.get("/operation", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const operation = await businessDatabase.getStoreOperation(context);
    return reply.code(200).send({ operation });
  });

  app.put<{ Body: unknown }>("/operation/hours", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = scheduleSchema.safeParse(request.body);
    if (
      !body.success ||
      !validateOperatingPeriods(body.data.periods as OperatingPeriod[]).ok
    ) {
      return reply.code(400).send({ error: "invalid_operating_periods" });
    }

    const periods = await businessDatabase.replaceOperatingPeriods(
      context,
      body.data.periods,
    );
    return reply.code(200).send({ periods });
  });

  app.put<{ Body: unknown }>("/operation/pause", async (request, reply) => {
    const context = await requireMembership(request, reply, "owner");
    if (!context) return reply;

    const body = pauseSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_pause" });
    }

    const operation = await businessDatabase.setStorePaused(
      context,
      body.data.paused,
    );
    return reply.code(200).send({ operation });
  });
}
