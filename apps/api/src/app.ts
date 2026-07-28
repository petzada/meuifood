import Fastify, { type FastifyBaseLogger } from "fastify";
import pino, { type DestinationStream } from "pino";

import { healthResponseSchema } from "@foode/shared";

import { safeLoggerOptions } from "./logger.js";
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";

type BuildAppOptions = {
  logger?: boolean;
  loggerDestination?: DestinationStream;
};

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

  registerErrorObservability(app);

  return app;
}
