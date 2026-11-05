// Fetch público da api (decisão 59, "Fronteira de exposição"): só `/health`, o
// Storefront (`/storefront/*`), as imagens do Cardápio (`/media/*`, decisão 64) e webhooks dos
// provedores (`/webhooks/*`). Operações do Painel NÃO passam por aqui: ficam no entrypoint
// `PainelApi` (painel.ts), alcançável só por service binding.
import { createFoodeDb, type FoodeDb } from "@foode/db";
import type { ApiHealth } from "@foode/shared";
import { cartQuoteRequestSchema, cartSubtotalCents, indexMenuItems } from "@foode/shared/menu";
import * as Sentry from "@sentry/cloudflare";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createTurnstileVerifier } from "./auth/turnstile";
import type { Env } from "./env";
import { mediaBaseUrl, serveMenuImage } from "./media";
import { toPublicMenu } from "./public-menu";
import { createStorefrontService } from "./storefront-service";

export { toPublicMenu };

type AppEnv = { Bindings: Env; Variables: { db: FoodeDb } };

export async function apiHealth(db: FoodeDb): Promise<ApiHealth> {
  const databaseOk = await db.ping().catch(() => false);
  return {
    status: databaseOk ? "ok" : "degraded",
    service: "api",
    database: databaseOk ? "ok" : "unavailable",
  };
}

/** Teto do corpo do recálculo do carrinho (50 linhas cabem com folga). */
export const CART_QUOTE_MAX_BODY_BYTES = 64 * 1024;

/** Teto do corpo da busca por telefone e do "Sou eu" (token do Turnstile ≤ 2 KiB). */
export const PHONE_LOOKUP_MAX_BODY_BYTES = 8 * 1024;

/** Caminho sem o token da página do Pedido (dá acesso a dados pessoais): nunca em log. */
export function redactPath(path: string): string {
  return path.replace(/\/pedidos\/[^/]+/u, "/pedidos/:token");
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

  // Cardápio público (Ticket 23): 200 = `publicMenuSchema` de @foode/shared/menu (só categorias
  // disponíveis e com itens; itens indisponíveis vêm com `available: false`; opções com
  // `priceCents`; até 4 `featured`; `imageUrl` = MEDIA_PUBLIC_BASE_URL + chave). A Loja sai SÓ do
  // Slug da URL, nunca de `store_id` do navegador. 404 `store_not_found` para Slug inexistente ou
  // Loja fora de `active` (o Storefront mostra "Cardápio indisponível").
  storefront.get("/lojas/:slug/cardapio", async (c) => {
    const menu = await c.var.db.storefront.publicMenuBySlug(c.req.param("slug"));
    if (!menu) return c.json({ error: "store_not_found" }, 404);
    return c.json(toPublicMenu(menu, mediaBaseUrl(c.env.MEDIA_PUBLIC_BASE_URL, c.req.url)));
  });

  // Recálculo do carrinho no servidor (Ticket 23): corpo `cartQuoteRequestSchema` (400
  // `invalid_input`), 200 = `cartQuoteResponseSchema` (= `cartSubtotalCents` sobre o Cardápio da
  // Loja do Slug, com o preço das opções de Complemento). Preço nunca vem do navegador: o corpo
  // só tem ids e quantidades.
  storefront.post(
    "/lojas/:slug/carrinho",
    bodyLimit({
      maxSize: CART_QUOTE_MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "invalid_input" }, 413),
    }),
    async (c) => {
      const body: unknown = await c.req.json().catch(() => undefined);
      const parsed = cartQuoteRequestSchema.safeParse(body);
      if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
      const menu = await c.var.db.storefront.publicMenuBySlug(c.req.param("slug"));
      if (!menu) return c.json({ error: "store_not_found" }, 404);
      const publicMenu = toPublicMenu(menu, null);
      return c.json(cartSubtotalCents(indexMenuItems(publicMenu), parsed.data));
    },
  );
  // ---- Ticket 24a: checkout, Pedido e busca por telefone (regras em storefront-service.ts). A
  // Loja sai SÓ do Slug da URL e precisa estar `active` (senão 404 `store_not_found`). Schemas em
  // @foode/shared/order; corpo inválido = 400 `invalid_input`.
  const service = (c: Context<AppEnv>) =>
    createStorefrontService({
      db: c.var.db,
      turnstile: createTurnstileVerifier(c.env),
      orderTokenSecret: c.env.ORDER_TOKEN_SECRET,
      phoneLookupIpSalt: c.env.PHONE_LOOKUP_IP_SALT,
    });
  const jsonBody = (c: Context<AppEnv>): Promise<unknown> =>
    c.req.json<unknown>().catch(() => undefined);
  const limit = (maxSize: number) =>
    bodyLimit({ maxSize, onError: (c) => c.json({ error: "invalid_input" }, 413) });

  // Estado da Loja + "Sobre a Loja": 200 = `storefrontStoreStateSchema` (aberta até / fechada com
  // próxima abertura / Pausa, por `storeOpenState` em America/Sao_Paulo; horários; Delivery com
  // só bairros ativos ou Taxa fixa; Retirada com endereço; meios com taxa vigente; bandeiras).
  storefront.get("/lojas/:slug/estado", async (c) => {
    const reply = await service(c).state(c.req.param("slug"));
    return c.json(reply.body, reply.status);
  });

  // Cotação do checkout: corpo `checkoutQuoteRequestSchema`, 200 = `checkoutQuoteResponseSchema`
  // (preços, Delivery, mínimo e meios recalculados no servidor; nada gravado).
  storefront.post("/lojas/:slug/checkout/cotacao", limit(CART_QUOTE_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).quote(c.req.param("slug"), await jsonBody(c));
    return c.json(reply.body, reply.status);
  });

  // Criação idempotente do Pedido: corpo `checkoutCreateRequestSchema`; 201 novo, 200 replay
  // (mesma chave e corpo), erros com `checkoutErrorHttpStatus` = `checkoutCreateResponseSchema`.
  // Loja ativa, Pausa, horário, Retirada, bairro, mínimo e itens conferidos na mesma escrita
  // (`batch` + INSERT … SELECT condicional + constraints).
  storefront.post("/lojas/:slug/pedidos", limit(CART_QUOTE_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).create(c.req.param("slug"), await jsonBody(c));
    return c.json(reply.body, reply.status);
  });

  // Página do Pedido: 200 = `orderTrackingSchema`; token de outra Loja ou inexistente = 404
  // `order_not_found` (sem distinguir). `no-store`: o corpo tem dados pessoais do Pedido.
  storefront.get("/lojas/:slug/pedidos/:token", async (c) => {
    const reply = await service(c).track(c.req.param("slug"), c.req.param("token"));
    c.header("cache-control", "no-store");
    return c.json(reply.body, reply.status);
  });

  // Busca por telefone (P-2.1), só Pedidos da mesma Loja: corpo `phoneLookupRequestSchema`
  // (Turnstile: 403 `captcha_failed`; rate limit por IP e por telefone: 429 `rate_limited`), 200 =
  // `phoneLookupResponseSchema` mascarada; toda consulta vai para `phone_lookups` sem telefone.
  // O IP é o `cf-connecting-ip` (o Storefront repassa o do navegador pelo binding).
  storefront.post("/lojas/:slug/clientes/busca", limit(PHONE_LOOKUP_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).lookup(
      c.req.param("slug"),
      await jsonBody(c),
      c.req.header("cf-connecting-ip") ?? null,
    );
    c.header("cache-control", "no-store");
    return c.json(reply.body, reply.status);
  });

  // "Sou eu": corpo `phoneLookupConfirmRequestSchema` (token de uso único, curto), 200 =
  // `phoneLookupConfirmResponseSchema` com os dados completos do último Pedido na mesma Loja.
  storefront.post(
    "/lojas/:slug/clientes/confirmar",
    limit(PHONE_LOOKUP_MAX_BODY_BYTES),
    async (c) => {
      const reply = await service(c).confirm(c.req.param("slug"), await jsonBody(c));
      c.header("cache-control", "no-store");
      return c.json(reply.body, reply.status);
    },
  );
  app.route("/storefront", storefront);

  // Imagens do Cardápio (decisão 64): leitura pública só de chaves `stores/{uuid}/menu/{uuid}.{ext}`.
  app.get("/media/stores/:storeId/menu/:file", (c) =>
    serveMenuImage(c.env.MEDIA, c.req.param("storeId"), c.req.param("file"), c.req.raw),
  );

  // `/webhooks/*`: rotas dos provedores (AbacatePay, Efí) entram nos Tickets 26 e 27.
  // Qualquer outro caminho (inclusive operações do Painel) responde 404.

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    Sentry.captureException(error);
    console.error(
      JSON.stringify({ level: "error", message: error.message, path: redactPath(c.req.path) }),
    );
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
