// Rotas públicas do Storefront do Ticket 24a (app.ts só faz o HTTP): estado da Loja, cotação,
// criação idempotente do Pedido, página do Pedido por token, busca por telefone e "Sou eu".
// A Loja sai SÓ do Slug (sempre `active` em @foode/db); preço, Delivery, mínimo, troco e total
// são recalculados aqui; Loja ativa, Pausa, horário, Fulfillment, bairro, mínimo e itens são
// conferidos de novo na própria escrita (`db.storefront.createOrder`).
// Dados pessoais: nenhum log aqui. Telefone, endereço e tokens nunca vão para log/Sentry.
import type { FoodeDb } from "@foode/db";
import {
  type CheckoutCreateResponse,
  checkoutCreateRequestSchema,
  type CheckoutError,
  checkoutErrorHttpStatus,
  checkoutQuoteRequestSchema,
  type CheckoutQuoteResponse,
  firstNameOf,
  orderAccessTokenSchema,
  orderTrackingPath,
  orderTrackingSchema,
  PHONE_LOOKUP_CONFIRM_TTL_SECONDS,
  PHONE_LOOKUP_RATE_LIMIT,
  phoneE164Schema,
  phoneLookupConfirmRequestSchema,
  phoneLookupConfirmResponseSchema,
  phoneLookupRequestSchema,
  phoneLookupResponseSchema,
  type StorefrontStoreState,
} from "@foode/shared/order";
import {
  FUNNEL_EVENT_RATE_LIMIT,
  funnelDay,
  funnelEventRequestSchema,
  type FunnelEvent,
} from "@foode/shared/onboarding";

import type { TurnstileVerifier } from "./auth/turnstile";
import {
  availablePaymentMethods,
  buildStoreState,
  checkPayment,
  orderAddressOf,
  quoteCheckout,
} from "./checkout-rules";
import { toStorefrontShowcase } from "./showcase";
import {
  canonicalJson,
  ipHash,
  orderAccessToken,
  phoneRateKey,
  randomToken,
  requireSecret,
  sha256Hex,
} from "./order-crypto";

export type StorefrontServiceDeps = {
  db: FoodeDb;
  turnstile: TurnstileVerifier;
  /** ORDER_TOKEN_SECRET / PHONE_LOOKUP_IP_SALT do Worker (conferidos só quando usados). */
  orderTokenSecret: string | undefined;
  phoneLookupIpSalt: string | undefined;
  /** Base pública das imagens (logo/capa da vitrine, Ticket 28); null = sem URL. */
  mediaBaseUrl?: string | null;
  now?: () => Date;
};

/** Resposta HTTP de uma rota: status + corpo JSON. */
export type Reply<T> = { status: 200 | 201 | 400 | 403 | 404 | 409 | 422 | 429; body: T };

const STORE_NOT_FOUND = { status: 404, body: { error: "store_not_found" } } as const;
const INVALID_INPUT = { status: 400, body: { error: "invalid_input" } } as const;

/**
 * Rate limit da busca por telefone pelo número (além do por IP em `phone_lookups`). A janela
 * não passa de 300 s: o Better Auth apaga da tabela `rate_limits` as linhas mais velhas que isso.
 */
export const PHONE_LOOKUP_PHONE_RATE_LIMIT = { max: 5, windowSeconds: 300 } as const;

/** Tentativas da criação quando a escrita condicional recusa (estado mudou entre leitura e escrita). */
const CREATE_ATTEMPTS = 3;

function checkoutFailure(error: CheckoutError): Reply<CheckoutCreateResponse> {
  return { status: checkoutErrorHttpStatus(error.code), body: { ok: false, error } };
}

export function createStorefrontService(deps: StorefrontServiceDeps) {
  const { db, turnstile } = deps;
  const clock = deps.now ?? (() => new Date());

  async function paymentMethodsOf(storeId: string) {
    return availablePaymentMethods(await db.checkout.effectivePaymentFees(storeId));
  }

  async function replyCreated(
    slug: string,
    orderId: string,
    code: number,
    replayed: boolean,
  ): Promise<Reply<CheckoutCreateResponse>> {
    const secret = requireSecret(deps.orderTokenSecret, "ORDER_TOKEN_SECRET");
    const accessToken = await orderAccessToken(secret, orderId);
    return {
      status: replayed ? 200 : 201,
      body: {
        ok: true,
        replayed,
        orderCode: code,
        accessToken,
        trackingPath: orderTrackingPath(slug, accessToken),
      },
    };
  }

  /**
   * +1 no funil do dia (Ticket 28). Falha não derruba o Pedido nem a request: o funil é métrica
   * agregada; registra sem dado pessoal.
   */
  async function countFunnel(slug: string, event: FunnelEvent): Promise<boolean> {
    try {
      return await db.storefront.recordFunnelEvent(slug, event, funnelDay(clock().getTime()));
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "funnel_count_failed",
          event,
          cause: error instanceof Error ? error.message : "desconhecido",
        }),
      );
      return false;
    }
  }

  return {
    /**
     * Evento do funil próprio vindo do navegador (visita, item, carrinho, checkout). Corpo só com
     * o nome do evento; rate limit por hash do IP truncado + Loja (o IP não é gravado em lugar
     * nenhum além da chave com hash do rate limit, que expira). Slug inexistente/inativo = 404.
     */
    async funnel(
      slug: string,
      body: unknown,
      ip: string | null,
    ): Promise<{ status: 204; body: null } | Reply<{ error: string }>> {
      const parsed = funnelEventRequestSchema.safeParse(body);
      if (!parsed.success) return INVALID_INPUT;
      const salt = requireSecret(deps.phoneLookupIpSalt, "PHONE_LOOKUP_IP_SALT");
      const allowed = await db.rateLimit.consume(
        `funnel:${await ipHash(salt, ip)}:${slug}`,
        FUNNEL_EVENT_RATE_LIMIT,
      );
      if (!allowed) return { status: 429, body: { error: "rate_limited" } };
      const counted = await countFunnel(slug, parsed.data.event);
      return counted ? { status: 204, body: null } : STORE_NOT_FOUND;
    },

    /** Estado da Loja + "Sobre a Loja". */
    async state(slug: string): Promise<Reply<StorefrontStoreState | { error: string }>> {
      const state = await db.storefront.operationBySlug(slug);
      if (!state) return STORE_NOT_FOUND;
      const [methods, showcase] = await Promise.all([
        paymentMethodsOf(state.store.id),
        db.storefront.showcaseOf(state.store.id),
      ]);
      const body = buildStoreState(state, clock(), methods);
      return {
        status: 200,
        body: { ...body, showcase: toStorefrontShowcase(showcase, deps.mediaBaseUrl ?? null) },
      };
    },

    /** Cotação: nada gravado; erro de regra = 200 com `ok: false` (mesmo shape da criação). */
    async quote(
      slug: string,
      body: unknown,
    ): Promise<Reply<CheckoutQuoteResponse | { error: string }>> {
      const parsed = checkoutQuoteRequestSchema.safeParse(body);
      if (!parsed.success) return INVALID_INPUT;
      const snapshot = await db.storefront.checkoutSnapshot(slug);
      if (!snapshot) return STORE_NOT_FOUND;
      const outcome = quoteCheckout(snapshot, parsed.data, clock());
      if (!outcome.ok) return { status: 200, body: { ok: false, error: outcome.error } };
      const { quote } = outcome;
      return {
        status: 200,
        body: {
          ok: true,
          subtotalCents: quote.subtotalCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          discountCents: quote.discountCents,
          totalCents: quote.totalCents,
          minimumOrder: quote.minimumOrder,
          eta: quote.eta,
          paymentMethods: await paymentMethodsOf(snapshot.store.id),
        },
      };
    },

    /**
     * Criação idempotente. Mesma chave + mesmo corpo = o mesmo Pedido (200, `replayed`), mesmo
     * depois de a Loja fechar; mesma chave + corpo diferente = 409 `idempotency_conflict`.
     */
    async create(
      slug: string,
      body: unknown,
    ): Promise<Reply<CheckoutCreateResponse | { error: string }>> {
      const parsed = checkoutCreateRequestSchema.safeParse(body);
      if (!parsed.success) return INVALID_INPUT;
      const request = parsed.data;
      const { idempotencyKey, ...payload } = request;
      const payloadHash = await sha256Hex(canonicalJson(payload));

      const replay = async (existing: { orderId: string; code: number; payloadHash: string }) =>
        existing.payloadHash === payloadHash
          ? replyCreated(slug, existing.orderId, existing.code, true)
          : checkoutFailure({ code: "idempotency_conflict" });

      const previous = await db.storefront.findByIdempotencyKey(slug, idempotencyKey);
      if (previous) return replay(previous);

      const secret = requireSecret(deps.orderTokenSecret, "ORDER_TOKEN_SECRET");
      const orderId = crypto.randomUUID();
      const accessTokenHash = await sha256Hex(await orderAccessToken(secret, orderId));

      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
        const snapshot = await db.storefront.checkoutSnapshot(slug);
        if (!snapshot) return STORE_NOT_FOUND;
        const now = clock();
        const outcome = quoteCheckout(snapshot, request, now);
        if (!outcome.ok) return checkoutFailure(outcome.error);
        const { quote } = outcome;
        const paymentError = checkPayment(
          quote,
          request.payment,
          await paymentMethodsOf(snapshot.store.id),
        );
        if (paymentError) return checkoutFailure(paymentError);

        const address = quote.neighborhoodName
          ? orderAddressOf(request, quote.neighborhoodName)
          : null;
        const result = await db.storefront.createOrder({
          slug,
          orderId,
          accessTokenHash,
          idempotencyKey,
          payloadHash,
          now: now.toISOString(),
          civil: quote.civil,
          fulfillment: request.fulfillment,
          paymentMethod: request.payment.method,
          customerName: request.customer.name,
          customerPhoneE164: request.customer.phone,
          delivery: quote.delivery && address ? { ...quote.delivery, address } : null,
          subtotalCents: quote.subtotalCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          discountCents: quote.discountCents,
          totalCents: quote.totalCents,
          changeForCents: request.payment.changeForCents,
          note: request.note,
          eta: quote.eta,
          lines: quote.lines,
          itemPrices: quote.itemPrices,
        });
        if (result.kind === "created") {
          await countFunnel(slug, "order");
          return replyCreated(slug, result.orderId, result.code, false);
        }
        if (result.kind === "existing") return replay(result);
        // Recusado na escrita: o estado mudou entre a leitura e a escrita; recota com o novo.
      }
      throw new Error("checkout: escrita condicional recusada repetidamente");
    },

    /** Página do Pedido: token desta Loja; outro/inexistente = 404 sem distinguir. */
    async track(slug: string, token: string) {
      const notFound = { status: 404, body: { error: "order_not_found" } } as const;
      if (!orderAccessTokenSchema.safeParse(token).success) return notFound;
      const found = await db.storefront.orderByTokenHash(slug, await sha256Hex(token));
      if (!found) return notFound;
      const { order, store, address } = found;
      const whatsapp = phoneE164Schema.safeParse(store.whatsapp);
      return {
        status: 200,
        body: orderTrackingSchema.parse({
          code: order.code,
          status: order.status,
          fulfillment: order.fulfillment,
          createdAt: order.createdAt,
          eta:
            order.etaMin !== null && order.etaMax !== null
              ? { minMinutes: order.etaMin, maxMinutes: order.etaMax }
              : null,
          store: {
            slug: store.slug,
            name: store.name,
            whatsapp: whatsapp.success ? whatsapp.data : null,
          },
          customerFirstName: firstNameOf(order.customerName),
          lines: order.lines,
          subtotalCents: order.subtotalCents,
          deliveryFeeCents: order.deliveryFeeCents,
          discountCents: order.discountCents,
          totalCents: order.totalCents,
          payment: { method: order.paymentMethod, changeForCents: order.changeForCents },
          note: order.note,
          address,
        }),
      } as const;
    },

    /**
     * Busca por telefone (P-2.1): rate limit por IP (na própria escrita da auditoria) e por
     * telefone, Turnstile, só Pedidos desta Loja, resposta mascarada (primeiro nome + rua sem
     * número + bairro) e token de uso único para o "Sou eu". Toda consulta fica em
     * `phone_lookups` (Loja, quando, hash do IP truncado, resultado), sem telefone.
     */
    async lookup(slug: string, body: unknown, ip: string | null) {
      const parsed = phoneLookupRequestSchema.safeParse(body);
      if (!parsed.success) return INVALID_INPUT;
      const salt = requireSecret(deps.phoneLookupIpSalt, "PHONE_LOOKUP_IP_SALT");
      const now = clock();
      const begin = await db.storefront.phoneLookupBegin({
        slug,
        ipHash: await ipHash(salt, ip),
        now: now.toISOString(),
        windowStart: new Date(
          now.getTime() - PHONE_LOOKUP_RATE_LIMIT.windowSeconds * 1000,
        ).toISOString(),
        max: PHONE_LOOKUP_RATE_LIMIT.max,
      });
      if (!begin) return STORE_NOT_FOUND;
      const rateLimited = { status: 429, body: { error: "rate_limited" } } as const;
      if (begin.rateLimited) return rateLimited;
      const phoneAllowed = await db.rateLimit.consume(
        `phone-lookup:${slug}:${await phoneRateKey(salt, parsed.data.phone)}`,
        PHONE_LOOKUP_PHONE_RATE_LIMIT,
      );
      if (!phoneAllowed) {
        await db.storefront.phoneLookupFail(begin.lookupId, "rate_limited");
        return rateLimited;
      }
      if (!(await turnstile.verify(parsed.data.turnstileToken, ip))) {
        await db.storefront.phoneLookupFail(begin.lookupId, "captcha_failed");
        return { status: 403, body: { error: "captcha_failed" } } as const;
      }
      const confirmToken = randomToken();
      const match = await db.storefront.phoneLookupMatch({
        lookupId: begin.lookupId,
        phoneE164: parsed.data.phone,
        confirmTokenHash: await sha256Hex(confirmToken),
        expiresAt: new Date(now.getTime() + PHONE_LOOKUP_CONFIRM_TTL_SECONDS * 1000).toISOString(),
      });
      const response = match.found
        ? {
            found: true as const,
            confirmToken,
            masked: {
              firstName: firstNameOf(match.customerName),
              street: match.street,
              neighborhood: match.neighborhood,
            },
          }
        : { found: false as const };
      return { status: 200, body: phoneLookupResponseSchema.parse(response) } as const;
    },

    /** "Sou eu": token de uso único e curto, desta Loja; senão `{ found: false }`. */
    async confirm(slug: string, body: unknown) {
      const parsed = phoneLookupConfirmRequestSchema.safeParse(body);
      if (!parsed.success) return INVALID_INPUT;
      const found = await db.storefront.phoneLookupConfirm({
        slug,
        confirmTokenHash: await sha256Hex(parsed.data.confirmToken),
        now: clock().toISOString(),
      });
      const response = found
        ? {
            found: true as const,
            customer: { name: found.customerName, phone: found.customerPhone },
            address: found.address,
          }
        : { found: false as const };
      return { status: 200, body: phoneLookupConfirmResponseSchema.parse(response) } as const;
    },
  };
}

export type StorefrontService = ReturnType<typeof createStorefrontService>;
