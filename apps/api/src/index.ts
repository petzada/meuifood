// Worker `foode-api` (Hono). Default export = fetch público (app.ts); `PainelApi` =
// entrypoint RPC do Painel, só por service binding. Sentry é opcional: sem SENTRY_DSN o
// SDK fica desligado.
import * as Sentry from "@sentry/cloudflare";

import { createApp, redactPath } from "./app";
import type { Env } from "./env";

export { PainelApi } from "./painel";

const app = createApp();

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Token da página do Pedido na URL e corpos do checkout (telefone/endereço) nunca no Sentry.
    beforeSend(event) {
      if (event.request) {
        if (event.request.url) event.request.url = redactPath(event.request.url);
        delete event.request.data;
        delete event.request.query_string;
      }
      return event;
    },
  }),
  { fetch: app.fetch } satisfies ExportedHandler<Env>,
);
