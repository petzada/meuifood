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

import { panelUrlOf } from "./auth/auth";
import { createTurnstileVerifier } from "./auth/turnstile";
import { type CustomerReply, createCustomerService } from "./customer-service";
import { createMillionSendSender } from "./email/sender";
import type { Env } from "./env";
import { createLeadService } from "./lead-service";
import { mediaBaseUrl, serveMenuImage, serveStoreImage } from "./media";
import {
  ABACATEPAY_SECRET_QUERY_PARAM,
  ABACATEPAY_SIGNATURE_HEADER,
  abacatePayFromEnv,
  createPixService,
} from "./pix-service";
import { toPublicMenu } from "./public-menu";
import { createStorefrontService } from "./storefront-service";
import { createWhatsMiauSender } from "./whatsapp/whatsmiau";

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

/** Teto do corpo das rotas da conta do Consumidor (telefone, código, nome, CPF, Turnstile). */
export const CUSTOMER_MAX_BODY_BYTES = 8 * 1024;

/** Teto do corpo do webhook da AbacatePay (o envelope tem poucos KiB). */
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

/** Teto do corpo do lead da landing (5 campos curtos + token do Turnstile ≤ 2 KiB). */
export const LEAD_MAX_BODY_BYTES = 8 * 1024;

/** Link do aviso de lead: `/ops/leads` no Painel (BETTER_AUTH_URL); null sem Painel. */
export function opsLeadsUrlOf(env: Pick<Env, "BETTER_AUTH_URL">): string | null {
  try {
    return new URL("/ops/leads", panelUrlOf(env)).href;
  } catch {
    return null;
  }
}

/** Teto do corpo do evento do funil (`{"event":"checkout_start"}`). */
export const FUNNEL_EVENT_MAX_BODY_BYTES = 1024;

const STOREFRONT_SLUG_PATH = /^\/storefront\/lojas\/([^/]+)(\/.*)?$/u;

/**
 * 308 do link antigo para o atual (decisão 69) ou null se o caminho não é de Loja / o slug não
 * está no histórico. `Location` relativo: mesmo caminho e query, com o slug atual.
 */
export async function storefrontSlugRedirect(
  requestUrl: string,
  currentSlugOf: (slug: string) => Promise<string | null>,
): Promise<Response | null> {
  const url = new URL(requestUrl);
  const match = STOREFRONT_SLUG_PATH.exec(url.pathname);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  const current = await currentSlugOf(slug);
  if (!current || current === slug) return null;
  return Response.json(
    { error: "slug_moved", currentSlug: current },
    {
      status: 308,
      headers: {
        location: `/storefront/lojas/${current}${match[2] ?? ""}${url.search}`,
        "x-foode-current-slug": current,
        // A Loja pode voltar ao link antigo: o redirecionamento não fica em cache.
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Caminho sem o token da página do Pedido (dá acesso a dados pessoais) e sem query (o webhook da
 * AbacatePay leva o segredo em `?webhookSecret=`): nunca em log nem no Sentry.
 */
export function redactPath(path: string): string {
  return path.replace(/[?#].*$/su, "").replace(/\/pedidos\/[^/]+/u, "/pedidos/:token");
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

  // Link personalizado antigo (decisão 69): toda rota `/storefront/lojas/:slug/*` que daria 404
  // com um slug do histórico responde 308 para o MESMO caminho com o link atual (um salto, query
  // preservada, qualquer estado da Loja). Corpo `{ error: "slug_moved", currentSlug }` e header
  // `x-foode-current-slug`, para o web (fetch com `redirect: "manual"`) responder 308 para
  // `/loja/{atual}{subcaminho}?{query}`. Só consulta o histórico quando a rota deu 404: custo zero
  // no caminho feliz e sem efeito colateral (slug do histórico nunca é o atual de uma Loja).
  storefront.use("*", async (c, next) => {
    await next();
    if (c.res.status !== 404) return;
    try {
      const redirect = await storefrontSlugRedirect(c.req.url, (slug) =>
        c.var.db.storefront.currentSlugForHistorical(slug),
      );
      if (redirect) c.res = redirect;
    } catch (error) {
      // Falha na consulta do histórico não troca o 404 original por 500.
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "slug_history_lookup_failed",
          cause: error instanceof Error ? error.message : "desconhecido",
        }),
      );
    }
  });

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
  const customer = (c: Context<AppEnv>) =>
    createCustomerService({
      db: c.var.db,
      turnstile: createTurnstileVerifier(c.env),
      whatsapp: createWhatsMiauSender(c.env),
      codeSecret: c.env.BETTER_AUTH_SECRET,
      ipSalt: c.env.PHONE_LOOKUP_IP_SALT,
      orderTokenSecret: c.env.ORDER_TOKEN_SECRET,
    });
  const pix = (c: Context<AppEnv>) =>
    createPixService({ db: c.var.db, provider: abacatePayFromEnv(c.env) });
  const service = (c: Context<AppEnv>) =>
    createStorefrontService({
      pix: pix(c),
      db: c.var.db,
      turnstile: createTurnstileVerifier(c.env),
      orderTokenSecret: c.env.ORDER_TOKEN_SECRET,
      phoneLookupIpSalt: c.env.PHONE_LOOKUP_IP_SALT,
      mediaBaseUrl: mediaBaseUrl(c.env.MEDIA_PUBLIC_BASE_URL, c.req.url),
      customerSessionOf: async (cookie) =>
        (await customer(c).currentSession(cookie))?.session ?? null,
    });
  const cookieOf = (c: Context<AppEnv>) => c.req.header("cookie") ?? null;
  const ipOf = (c: Context<AppEnv>) => c.req.header("cf-connecting-ip") ?? null;
  /** Resposta da conta: `no-store` sempre e o `set-cookie` da sessão quando muda. */
  const customerResponse = (c: Context<AppEnv>, reply: CustomerReply<unknown>) => {
    c.header("cache-control", "no-store");
    if (reply.setCookie) c.header("set-cookie", reply.setCookie);
    if (reply.status === 204) return c.body(null, 204);
    return c.json(reply.body, reply.status);
  };
  const jsonBody = (c: Context<AppEnv>): Promise<unknown> =>
    c.req.json<unknown>().catch(() => undefined);
  const limit = (maxSize: number) =>
    bodyLimit({ maxSize, onError: (c) => c.json({ error: "invalid_input" }, 413) });

  // Estado da Loja + "Sobre a Loja": 200 = `storefrontStoreStateSchema` (aberta até / fechada com
  // próxima abertura / Pausa, por `storeOpenState` em America/Sao_Paulo; horários; Delivery com
  // só bairros ativos ou Taxa fixa; Retirada com endereço; meios com taxa vigente; bandeiras) e,
  // do Ticket 28, `showcase` (logo, capa, descrição, Instagram e IDs de Pixel só desta Loja).
  storefront.get("/lojas/:slug/estado", async (c) => {
    const reply = await service(c).state(c.req.param("slug"));
    return c.json(reply.body, reply.status);
  });

  // Cotação do checkout: corpo `checkoutQuoteRequestSchema`, 200 = `checkoutQuoteResponseSchema`
  // (preços, Delivery, mínimo e meios recalculados no servidor; nada gravado).
  // Ticket 13: corpo com `couponCode` opcional; o `cookie` da sessão do Consumidor (repassado pelo
  // Storefront) habilita o Cupom de boas-vindas; a resposta traz `coupon` (aplicado) ou o erro
  // `coupon_invalid` com o motivo.
  storefront.post("/lojas/:slug/checkout/cotacao", limit(CART_QUOTE_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).quote(c.req.param("slug"), await jsonBody(c), cookieOf(c));
    return c.json(reply.body, reply.status);
  });

  // Criação idempotente do Pedido: corpo `checkoutCreateRequestSchema`; 201 novo, 200 replay
  // (mesma chave e corpo), erros com `checkoutErrorHttpStatus` = `checkoutCreateResponseSchema`.
  // Loja ativa, Pausa, horário, Retirada, bairro, mínimo e itens conferidos na mesma escrita
  // (`batch` + INSERT … SELECT condicional + constraints).
  // Ticket 13: Cupom recalculado e contado na mesma escrita; com sessão do Consumidor, o Pedido
  // nasce ligado à conta.
  storefront.post("/lojas/:slug/pedidos", limit(CART_QUOTE_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).create(c.req.param("slug"), await jsonBody(c), cookieOf(c));
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
  // Funil próprio (Ticket 28, P-REL-4): corpo `funnelEventRequestSchema` (só `{ event }`, sem
  // nenhum dado pessoal; `order` é contado pela api na criação do Pedido), 204 = contado por Loja
  // e dia civil de São Paulo; 429 `rate_limited` por hash do IP truncado; 404 Loja inexistente ou
  // fora de `active`. Sem Turnstile (só incrementa contador agregado).
  storefront.post("/lojas/:slug/eventos", limit(FUNNEL_EVENT_MAX_BODY_BYTES), async (c) => {
    const reply = await service(c).funnel(
      c.req.param("slug"),
      await jsonBody(c),
      c.req.header("cf-connecting-ip") ?? null,
    );
    c.header("cache-control", "no-store");
    if (reply.status === 204) return c.body(null, 204);
    return c.json(reply.body, reply.status as 400 | 404 | 429);
  });
  // ---- Ticket 13: conta do Consumidor (contrato em @foode/shared/customer; regras em
  // customer-service.ts). Sessão por cookie `__Host-` que o Storefront repassa (`cookie` na ida,
  // `set-cookie` na volta) e fica no domínio do Storefront. Sem os secrets da whatsmiau, pedido e
  // verificação respondem 503 `login_unavailable`. Tudo `no-store`.
  storefront.post("/conta/codigo", limit(CUSTOMER_MAX_BODY_BYTES), async (c) =>
    customerResponse(c, await customer(c).requestCode(await jsonBody(c), ipOf(c))),
  );
  storefront.post("/conta/codigo/verificar", limit(CUSTOMER_MAX_BODY_BYTES), async (c) =>
    customerResponse(c, await customer(c).verifyCode(await jsonBody(c), ipOf(c))),
  );
  storefront.get("/conta", async (c) => customerResponse(c, await customer(c).state(cookieOf(c))));
  storefront.post("/conta", limit(CUSTOMER_MAX_BODY_BYTES), async (c) =>
    customerResponse(c, await customer(c).signup(await jsonBody(c), cookieOf(c), ipOf(c))),
  );
  storefront.post("/conta/sair", async (c) =>
    customerResponse(c, await customer(c).signOut(cookieOf(c))),
  );
  storefront.get("/lojas/:slug/conta/pedidos", async (c) =>
    customerResponse(c, await customer(c).orders(c.req.param("slug"), cookieOf(c))),
  );
  // ---- Ticket 31 (decisão 70): leads da landing e tabela padrão de taxas (lead-service.ts).
  const leads = (c: Context<AppEnv>) =>
    createLeadService({
      db: c.var.db,
      turnstile: createTurnstileVerifier(c.env),
      email: createMillionSendSender(c.env),
      waitUntil: (promise) => {
        try {
          c.executionCtx.waitUntil(promise);
        } catch {
          // Sem ExecutionContext (testes com `app.request`): o envio segue solto.
          void promise.catch(() => undefined);
        }
      },
      ipSalt: c.env.PHONE_LOOKUP_IP_SALT,
      notifyEmail: c.env.LEADS_NOTIFY_EMAIL,
      opsLeadsUrl: opsLeadsUrlOf(c.env),
    });

  // Lead da landing: corpo `leadCreateRequestSchema` (@foode/shared/lead). 201 `{ ok: true }`;
  // 400 `invalid_input`; 429 `rate_limited` (hash do IP truncado); 403 `captcha_failed`.
  storefront.post("/leads", limit(LEAD_MAX_BODY_BYTES), async (c) => {
    const reply = await leads(c).create(await jsonBody(c), ipOf(c));
    c.header("cache-control", "no-store");
    return c.json(reply.body, reply.status);
  });

  // Tabela padrão Foode vigente (PIX, Crédito Normal/Rápido) para a landing:
  // `publicDefaultFeesResponseSchema`. Cache curto: mudança de taxa aparece em minutos.
  storefront.get("/taxas", async (c) => {
    const body = await leads(c).defaultFees();
    c.header("cache-control", "public, max-age=300");
    return c.json(body);
  });
  app.route("/storefront", storefront);

  // Imagens do Cardápio (decisão 64): leitura pública só de chaves `stores/{uuid}/menu/{uuid}.{ext}`.
  app.get("/media/stores/:storeId/menu/:file", (c) =>
    serveMenuImage(c.env.MEDIA, c.req.param("storeId"), c.req.param("file"), c.req.raw),
  );
  // Logo e capa da Loja (Ticket 28): só chaves `stores/{uuid}/brand/{uuid}.{ext}`.
  app.get("/media/stores/:storeId/brand/:file", (c) =>
    serveStoreImage(c.env.MEDIA, c.req.param("storeId"), "brand", c.req.param("file"), c.req.raw),
  );

  // Webhook da AbacatePay (Ticket 26): `?webhookSecret=` (prova a origem) + `X-Webhook-Signature`
  // (HMAC-SHA256 do corpo CRU), ambos conferidos em tempo constante ANTES do parse. Evento com
  // identidade única: duplicata/reentrega/fora de ordem sem efeito duplo. Corpo, URL e segredo
  // nunca vão para log/Sentry (redactPath tira a query). Sem as chaves: 503 (PIX indisponível).
  // Efí (cartão) entra no Ticket 27.
  app.post(
    "/webhooks/abacatepay",
    bodyLimit({
      maxSize: WEBHOOK_MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "invalid_payload" }, 413),
    }),
    async (c) => {
      const reply = await pix(c).handleWebhook({
        rawBody: await c.req.text(),
        querySecret: c.req.query(ABACATEPAY_SECRET_QUERY_PARAM) ?? null,
        signature: c.req.header(ABACATEPAY_SIGNATURE_HEADER) ?? null,
      });
      c.header("cache-control", "no-store");
      return c.json(reply.body, reply.status);
    },
  );
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
