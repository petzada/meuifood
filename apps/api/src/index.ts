// Worker `foode-api` (Hono). Default export = fetch público (app.ts) + `scheduled` (Cron Triggers
// da reconciliação, Ticket 15, src/reconciliation.ts); `PainelApi` = entrypoint RPC do Painel, só
// por service binding. Sentry é opcional: sem SENTRY_DSN o SDK fica desligado.
import * as Sentry from "@sentry/cloudflare";

import { createApp, scrubSentryBreadcrumb, scrubSentryEvent } from "./app";
import type { Env } from "./env";
import { handleScheduled } from "./reconciliation";

export { PainelApi } from "./painel";

const app = createApp();

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.ENVIRONMENT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Token da página do Pedido na URL, corpos do checkout (telefone/endereço; no Cartão o token
    // do SDK, CPF, e-mail e nascimento), query com segredo de webhook e cookies nunca no Sentry.
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  }),
  {
    fetch: app.fetch,
    scheduled: (controller, env, ctx) => handleScheduled(controller, env, ctx),
  } satisfies ExportedHandler<Env>,
);
