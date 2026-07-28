import Fastify from "fastify";

import { healthResponseSchema } from "@foode/shared";

import { safeLoggerOptions } from "./logger.js";
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";

type BuildAppOptions = {
  logger?: boolean;
};

export function buildApp(options: BuildAppOptions = {}) {
  initializeObservability();

  const app = Fastify({
    logger: options.logger === false ? false : safeLoggerOptions,
  });

  app.get("/health", async (_request, reply) => {
    const body = healthResponseSchema.parse({ status: "ok", service: "api" });
    return reply.code(200).send(body);
  });

  registerErrorObservability(app);

  return app;
}
