import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";

let initialized = false;

export function initializeObservability() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn || initialized) {
    return;
  }

  Sentry.init({
    dsn,
    sendDefaultPii: false,
  });
  initialized = true;
}

export function registerErrorObservability(app: FastifyInstance) {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.setupFastifyErrorHandler(app);
}
