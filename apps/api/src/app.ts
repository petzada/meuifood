import Fastify, {
  type FastifyBaseLogger,
  type FastifyRequest,
} from "fastify";
import pino, { type DestinationStream } from "pino";
import { z } from "zod";

import type { BusinessDatabase, StoreContext } from "@foode/db";
import { healthResponseSchema } from "@foode/shared";

import { safeLoggerOptions } from "./logger.js";
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";

type BuildAppOptions = {
  businessDatabase?: BusinessDatabase;
  logger?: boolean;
  loggerDestination?: DestinationStream;
  resolveStoreContext?: (
    request: FastifyRequest,
  ) => Promise<StoreContext | undefined>;
};

const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export function buildApp(options: BuildAppOptions = {}) {
  initializeObservability();

  const app =
    options.logger === false
      ? Fastify({ logger: false })
      : options.loggerDestination
        ? Fastify({
            loggerInstance: pino(
              safeLoggerOptions,
              options.loggerDestination,
            ) as FastifyBaseLogger,
          })
        : Fastify({ logger: safeLoggerOptions });

  app.get("/health", async (_request, reply) => {
    const body = healthResponseSchema.parse({ status: "ok", service: "api" });
    return reply.code(200).send(body);
  });

  const { businessDatabase, resolveStoreContext } = options;
  if (businessDatabase && resolveStoreContext) {
    app.get<{ Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const context = await resolveStoreContext(request);
        if (!context) return reply.code(401).send({ error: "unauthorized" });

        const store = await businessDatabase.findStore(
          context,
          request.params.storeId,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );

    app.patch<{ Body: unknown; Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const context = await resolveStoreContext(request);
        if (!context) return reply.code(401).send({ error: "unauthorized" });

        const body = storeUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_store_update" });
        }

        const store = await businessDatabase.updateStoreName(
          context,
          request.params.storeId,
          body.data.name,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );
  }

  registerErrorObservability(app);

  return app;
}
