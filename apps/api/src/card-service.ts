// Cartão de crédito à vista (Ticket 27; decisões 60, 61, 65 e 71; ADR 0007): CONTRATO.
// Normal = Efí (API Cobranças, `payment_token`), Rápido = AbacatePay (transparente, `ctok_`). O
// modo é da Loja (Ops); o Storefront só recebe o tokenizador. Regras aqui, HTTP em app.ts,
// escrita em @foode/db (`db.cardPayments`), dinheiro em @foode/shared/payment.
//
// Prontos neste contrato: interfaces dos adapters, leitura do env e o tokenizador por modo. As
// operações (cobrança, nova tentativa, página do Pedido e webhooks) respondem 501 / lançam até a
// implementação do Ticket 27. Mesmas regras do PIX: intenção idempotente gravada antes da chamada,
// lease, só a confirmação canônica marca pago, e nada de token, CPF, e-mail, nascimento, corpo
// ou URL com segredo em log/Sentry.
import type { FoodeDb } from "@foode/db";
import type { CardMode } from "@foode/shared/ops";
import type { CardPaymentInput, CardTokenizer, OrderCard } from "@foode/shared/payment";

import type { Env } from "./env";
import {
  type AbacatePayCardCharge,
  type CreateCardChargeInput,
  createAbacatePayClient,
  type FetchLike,
} from "./providers/abacatepay/client";
import type { AbacatePayWebhookEvent } from "./providers/abacatepay/webhook";
import {
  type CreateEfiCardChargeInput,
  createEfiChargesClient,
  type EfiCardCharge,
  type EfiEnvironment,
} from "./providers/efi/client";
import { EFI_SECRET_QUERY_PARAM, type EfiNotificationEvent } from "./providers/efi/notification";

export { EFI_SECRET_QUERY_PARAM };

/** Teto do corpo de "Tentar outro cartão" (token + CPF + e-mail + nascimento). */
export const CARD_RETRY_MAX_BODY_BYTES = 8 * 1024;
/** Teto do corpo da notificação da Efí (só `notification=<token>`). */
export const EFI_NOTIFICATION_MAX_BODY_BYTES = 4 * 1024;
/** Caminho público da `notification_url` da Efí (sem a query `?secret=`). */
export const EFI_NOTIFICATION_PATH = "/webhooks/efi";

/** O que o Normal usa da Efí (o cliente real ou um fake nos testes). */
export type EfiCardGateway = {
  createCardCharge(input: CreateEfiCardChargeInput): Promise<EfiCardCharge>;
  getCharge(chargeId: number): Promise<EfiCardCharge>;
  getNotification(token: string): Promise<EfiNotificationEvent[]>;
};

/** O que o Rápido usa da AbacatePay (o cliente real ou um fake nos testes). */
export type AbacatePayCardGateway = {
  createCardCharge(input: CreateCardChargeInput): Promise<AbacatePayCardCharge>;
  getCardCharge(id: string): Promise<AbacatePayCardCharge>;
};

export type EfiCardProvider = {
  gateway: EfiCardGateway;
  /** Público: vai ao Storefront no tokenizador. */
  payeeCode: string;
  environment: EfiEnvironment;
  /** Segredo da `notification_url` (`?secret=`). Nunca logar. */
  notificationSecret: string;
  /** `https://api…/webhooks/efi` (sem a query). */
  notificationUrl: string;
};

export type AbacatePayCardProvider = {
  gateway: AbacatePayCardGateway;
  /** Público: vai ao Storefront no tokenizador. */
  publicKey: string;
};

function trimmed(value: string | undefined): string | null {
  const out = value?.trim();
  return out ? out : null;
}

/** Efí (Normal) configurada; null quando falta qualquer chave (Crédito Normal indisponível). */
export function efiCardFromEnv(
  env: Pick<
    Env,
    | "EFI_CLIENT_ID"
    | "EFI_CLIENT_SECRET"
    | "EFI_PAYEE_CODE"
    | "EFI_ENVIRONMENT"
    | "EFI_NOTIFICATION_SECRET"
    | "API_PUBLIC_URL"
  >,
  fetch?: FetchLike,
): EfiCardProvider | null {
  const clientId = trimmed(env.EFI_CLIENT_ID);
  const clientSecret = trimmed(env.EFI_CLIENT_SECRET);
  const payeeCode = trimmed(env.EFI_PAYEE_CODE);
  const notificationSecret = trimmed(env.EFI_NOTIFICATION_SECRET);
  const apiUrl = trimmed(env.API_PUBLIC_URL);
  if (!clientId || !clientSecret || !payeeCode || !notificationSecret || !apiUrl) return null;
  let notificationUrl: string;
  try {
    notificationUrl = new URL(EFI_NOTIFICATION_PATH, apiUrl).href;
  } catch {
    return null;
  }
  const environment: EfiEnvironment = env.EFI_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  return {
    gateway: createEfiChargesClient({
      clientId,
      clientSecret,
      environment,
      ...(fetch ? { fetch } : {}),
    }),
    payeeCode,
    environment,
    notificationSecret,
    notificationUrl,
  };
}

/**
 * AbacatePay (Rápido) configurada: as três chaves do PIX (API + webhook) e a chave pública do
 * abacatepay.js; null quando falta qualquer uma (Crédito Rápido indisponível).
 */
export function abacatePayCardFromEnv(
  env: Pick<
    Env,
    | "ABACATEPAY_API_KEY"
    | "ABACATEPAY_WEBHOOK_SECRET"
    | "ABACATEPAY_SIGNING_KEY"
    | "ABACATEPAY_PUBLIC_KEY"
  >,
  fetch?: FetchLike,
): AbacatePayCardProvider | null {
  const apiKey = trimmed(env.ABACATEPAY_API_KEY);
  const publicKey = trimmed(env.ABACATEPAY_PUBLIC_KEY);
  if (
    !apiKey ||
    !publicKey ||
    !trimmed(env.ABACATEPAY_WEBHOOK_SECRET) ||
    !trimmed(env.ABACATEPAY_SIGNING_KEY)
  ) {
    return null;
  }
  return {
    gateway: createAbacatePayClient({ apiKey, ...(fetch ? { fetch } : {}) }),
    publicKey,
  };
}

export type CardServiceDeps = {
  db: FoodeDb;
  efi: EfiCardProvider | null;
  abacatePay: AbacatePayCardProvider | null;
  now?: () => Date;
};

export type CardReply = {
  status: 200 | 201 | 400 | 404 | 409 | 422 | 501 | 503;
  body: { ok: true; trackingPath: string } | { error: string };
};

export type CardWebhookReply = {
  status: 200 | 400 | 401 | 501 | 503;
  body: { ok: true; outcome: string } | { error: string };
};

const NOT_IMPLEMENTED = { error: "not_implemented" } as const;

export type CardService = {
  /** Tokenizador do modo da Loja; null = Crédito indisponível (modo sem chaves ou sem modo). */
  tokenizerFor(mode: CardMode | null): CardTokenizer | null;
  /** Crédito pode aparecer no checkout (falta ainda a taxa Foode vigente, em checkout-rules). */
  available(mode: CardMode | null): boolean;
  /**
   * Depois de gravar o Pedido `credit` (e no replay): cobra a tentativa inicial no provedor do
   * modo gravado na intenção. Nunca lança; recusa vira `declined` com motivo.
   */
  chargeForOrder(orderId: string, card: CardPaymentInput): Promise<void>;
  /** Bloco do Cartão da página do Pedido (última tentativa); null fora do `credit`. */
  viewForOrder(orderId: string): Promise<OrderCard | null>;
  /**
   * `POST /storefront/lojas/:slug/pedidos/:token/cartao`: corpo `cardRetryRequestSchema`. 201
   * nova tentativa, 200 replay (mesma `attemptKey`), 409 `attempt_active`/`order_not_payable`,
   * 422 `payment_method_unavailable` (modo mudou ou sem chaves), 404 `order_not_found`.
   */
  retry(input: { slug: string; token: string; body: unknown }): Promise<CardReply>;
  /**
   * `POST /webhooks/efi?secret=…`: confere o segredo em tempo constante, lê o token do corpo e o
   * estado por `GET /v1/notification/:token` (eventos com `id` maior que o último visto).
   */
  handleEfiNotification(input: {
    rawBody: string;
    contentType: string | null;
    querySecret: string | null;
  }): Promise<CardWebhookReply>;
  /**
   * Evento `transparent.*` de CARD da AbacatePay, já autenticado pelo `/webhooks/abacatepay`
   * (mesma URL e segredos do PIX; o handler do PIX despacha `method: "CARD"` para cá).
   */
  handleAbacatePayCardEvent(
    event: Extract<AbacatePayWebhookEvent, { kind: "transparent" }>,
  ): Promise<CardWebhookReply>;
};

function notImplemented(name: string): Promise<never> {
  return Promise.reject(new Error(`card-service.${name}: implementação no Ticket 27`));
}

export function createCardService(deps: CardServiceDeps): CardService {
  const { efi, abacatePay } = deps;

  function tokenizerFor(mode: CardMode | null): CardTokenizer | null {
    if (mode === "normal" && efi) {
      return { sdk: "efi", payeeCode: efi.payeeCode, environment: efi.environment };
    }
    if (mode === "rapido" && abacatePay) {
      return { sdk: "abacatepay", publicKey: abacatePay.publicKey };
    }
    return null;
  }

  return {
    tokenizerFor,
    available: (mode) => tokenizerFor(mode) !== null,
    chargeForOrder: () => notImplemented("chargeForOrder"),
    viewForOrder: () => notImplemented("viewForOrder"),
    retry: () => Promise.resolve({ status: 501, body: NOT_IMPLEMENTED }),
    handleEfiNotification: () => Promise.resolve({ status: 501, body: NOT_IMPLEMENTED }),
    handleAbacatePayCardEvent: () => Promise.resolve({ status: 501, body: NOT_IMPLEMENTED }),
  };
}
