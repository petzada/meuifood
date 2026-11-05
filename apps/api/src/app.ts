// Fetch público da api (decisão 59, "Fronteira de exposição"): só `/health`, o
// Storefront (`/storefront/*`) e webhooks dos provedores (`/webhooks/*`). Operações do
// Painel NÃO passam por aqui: ficam no entrypoint `PainelApi` (painel.ts), alcançável só
// por service binding.
import { createFoodeDb, type FoodeDb } from "@foode/db";
import type { ApiHealth } from "@foode/shared";
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";

import type { Env } from "./env";

type AppEnv = { Bindings: Env; Variables: { db: FoodeDb } };

export async function apiHealth(db: FoodeDb): Promise<ApiHealth> {
  const databaseOk = await db.ping().catch(() => false);
  return {
    status: databaseOk ? "ok" : "degraded",
    service: "api",
    database: databaseOk ? "ok" : "unavailable",
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", createFoodeDb(c.env.DB));
    await next();
  });

  app.get("/health", async (c) => {
    const health = await apiHealth(c.var.db);
    return c.json(health, health.status === "ok" ? 200 : 503);
  });

  const storefront = new Hono<AppEnv>();
  storefront.get("/lojas/:slug", async (c) => {
    const store = await c.var.db.storefront.publicStoreBySlug(c.req.param("slug"));
    if (!store) return c.json({ error: "store_not_found" }, 404);
    return c.json(store);
  });
  app.route("/storefront", storefront);

  // `/webhooks/*`: rotas dos provedores (AbacatePay, Efí) entram nos Tickets 26 e 27.
  // Qualquer outro caminho (inclusive operações do Painel) responde 404.

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    Sentry.captureException(error);
    console.error(JSON.stringify({ level: "error", message: error.message, path: c.req.path }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
