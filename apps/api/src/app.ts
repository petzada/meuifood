// Fetch público da api (decisão 59, "Fronteira de exposição"): só `/health`, o
// Storefront (`/storefront/*`), as imagens do Cardápio (`/media/*`, decisão 64) e webhooks dos
// provedores (`/webhooks/*`). Operações do Painel NÃO passam por aqui: ficam no entrypoint
// `PainelApi` (painel.ts), alcançável só por service binding.
import { createFoodeDb, type FoodeDb, type PublicStoreMenu } from "@foode/db";
import type { ApiHealth } from "@foode/shared";
import {
  cartQuoteRequestSchema,
  cartSubtotalCents,
  indexMenuItems,
  type PublicMenu,
  publicMenuSchema,
} from "@foode/shared/menu";
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { Env } from "./env";
import { mediaBaseUrl, menuImageUrl, serveMenuImage } from "./media";

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

/**
 * Converte o Cardápio do D1 no contrato público e valida com `publicMenuSchema` (o mesmo schema
 * que o Storefront parseia). Sem `store_id`, sem chave interna de imagem: só `imageUrl`.
 */
export function toPublicMenu(menu: PublicStoreMenu, baseUrl: string | null): PublicMenu {
  return publicMenuSchema.parse({
    slug: menu.slug,
    name: menu.name,
    categories: menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        available: item.available,
        featured: item.featured,
        imageUrl: menuImageUrl(baseUrl, item.imageObjectKey),
        complementGroups: item.complementGroups,
        additionals: item.additionals,
      })),
    })),
  });
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
  // ---- Ticket 24a (CONTRATO; a fatia API troca cada 501 pela operação em @foode/db). A Loja sai
  // SÓ do Slug da URL e precisa estar `active` (senão 404 `store_not_found`). Schemas em
  // @foode/shared/order; corpo inválido = 400 `invalid_input`.

  // Estado da Loja + "Sobre a Loja": 200 = `storefrontStoreStateSchema` (aberta até / fechada com
  // próxima abertura / Pausa, por `storeOpenState` em America/Sao_Paulo; horários; Delivery com
  // só bairros ativos ou Taxa fixa; Retirada com endereço; meios com taxa vigente; bandeiras).
  storefront.get("/lojas/:slug/estado", (c) => c.json({ error: "not_implemented" }, 501));

  // Cotação do checkout: corpo `checkoutQuoteRequestSchema`, 200 = `checkoutQuoteResponseSchema`
  // (preços, Delivery, mínimo e meios recalculados no servidor; nada gravado).
  storefront.post("/lojas/:slug/checkout/cotacao", (c) =>
    c.json({ error: "not_implemented" }, 501),
  );

  // Criação idempotente do Pedido: corpo `checkoutCreateRequestSchema`; 201 novo, 200 replay
  // (mesma chave e corpo), erros com `checkoutErrorHttpStatus` = `checkoutCreateResponseSchema`.
  // Loja ativa, Pausa, horário, Retirada e bairro conferidos na mesma escrita (`batch` +
  // INSERT … SELECT condicional + constraints).
  storefront.post("/lojas/:slug/pedidos", (c) => c.json({ error: "not_implemented" }, 501));

  // Página do Pedido: 200 = `orderTrackingSchema`; token de outra Loja ou inexistente = 404
  // `order_not_found` (sem distinguir).
  storefront.get("/lojas/:slug/pedidos/:token", (c) => c.json({ error: "not_implemented" }, 501));

  // Busca por telefone (P-2.1), só Pedidos da mesma Loja: corpo `phoneLookupRequestSchema`
  // (Turnstile: 403 `captcha_failed`; rate limit por IP: 429 `rate_limited`), 200 =
  // `phoneLookupResponseSchema` mascarada; toda consulta vai para `phone_lookups` sem telefone.
  storefront.post("/lojas/:slug/clientes/busca", (c) => c.json({ error: "not_implemented" }, 501));

  // "Sou eu": corpo `phoneLookupConfirmRequestSchema` (token de uso único, curto), 200 =
  // `phoneLookupConfirmResponseSchema` com os dados completos do último Pedido na mesma Loja.
  storefront.post("/lojas/:slug/clientes/confirmar", (c) =>
    c.json({ error: "not_implemented" }, 501),
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
    console.error(JSON.stringify({ level: "error", message: error.message, path: c.req.path }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
