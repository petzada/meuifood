// Worker `foode-api` (Hono). Default export = fetch público (app.ts); `PainelApi` =
// entrypoint RPC do Painel, só por service binding. Sentry é opcional: sem SENTRY_DSN o
// SDK fica desligado.
import * as Sentry from "@sentry/cloudflare";

import { createApp } from "./app";
import type { Env } from "./env";

export { PainelApi } from "./painel";

const app = createApp();

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  { fetch: app.fetch } satisfies ExportedHandler<Env>,
);
