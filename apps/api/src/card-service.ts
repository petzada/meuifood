// Cartão de crédito à vista (Ticket 27; decisões 60, 61, 65, 71 e 76; ADR 0007). Normal = Efí
// (API Cobranças one-step, `payment_token`), Rápido = AbacatePay (transparente, `ctok_`). O modo é
// da Loja (Ops); o Storefront só recebe o tokenizador. Regras aqui, HTTP em app.ts, escrita em
// @foode/db (`db.cardPayments`), dinheiro em @foode/shared/payment (`cardLedger`).
//
// - Intenção idempotente gravada ANTES da chamada (a 1ª com o Pedido; "Tentar outro cartão" por
//   `attemptKey`). O token do cartão é de uso único: a chamada ao provedor acontece no máximo uma
//   vez por tentativa (`claimChargeAttempt` nunca reabre). Timeout/rede = desfecho incerto: fica
//   `processing` até a confirmação canônica chegar (webhook/notificação pelo `intentId`/custom_id)
//   ou a tentativa vencer (`provider_unavailable`, libera outra tentativa).
// - Só a confirmação canônica marca pago: resposta autenticada do provedor à nossa chamada,
//   webhook autenticado (AbacatePay: segredo + HMAC; Efí: `?secret=` + estado por
//   `GET /v1/notification/:token`) ou consulta autenticada. Nunca o navegador. Política Efí:
//   `approved` libera o Pedido (EFI_CARD_PAID_POLICY). Eventos repetidos/fora de ordem não
//   regridem (UPDATEs condicionais + identidade única do evento).
// - Nada de token, CPF, e-mail, nascimento, telefone, corpo ou URL com segredo em log/Sentry: os
//   logs levam só códigos curtos.
// - Ticket 12: aprovação de Pedido já cancelado converge para Estorno total (obrigação gravada no
//   batch da confirmação; `refunds.afterPayment` executa); aprovação de tentativa recusada depois
//   que o Pedido trocou de meio/já foi pago vira Estorno da cobrança órfã; notificação Efí
//   `refunded` conclui o Estorno (idempotente pelo evento).
import type { CardIntentView, FoodeDb, WebhookEventInput } from "@foode/db";
import type { CardMode } from "@foode/shared/ops";
import { orderAccessTokenSchema, orderTrackingPath } from "@foode/shared/order";
import {
  cardLedger,
  type CardDeclineReason,
  type CardPaymentInput,
  cardRetryRequestSchema,
  type CardRetryAction,
  type CardRetryResponse,
  type CardTokenizer,
  feeCents,
  type OrderCard,
  resolvePayerCpf,
} from "@foode/shared/payment";

import type { Env } from "./env";
import type { RefundService } from "./refund-service";
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
import { isAbacatePayError } from "./providers/abacatepay/errors";
import { isEfiError } from "./providers/efi/client";
import {
  EFI_SECRET_QUERY_PARAM,
  type EfiNotificationEvent,
  efiEventKey,
  parseEfiNotificationToken,
  unseenEfiEvents,
  verifyEfiNotificationSecret,
} from "./providers/efi/notification";
import {
  classifyEfiChargeStatus,
  EFI_CARD_PAID_POLICY,
  isEfiPaidForOrder,
} from "./providers/efi/status";
import { sha256Hex } from "./order-crypto";

export { EFI_SECRET_QUERY_PARAM };

/** Teto do corpo de "Tentar outro cartão" (token + CPF + e-mail + nascimento). */
export const CARD_RETRY_MAX_BODY_BYTES = 8 * 1024;
/** Teto do corpo da notificação da Efí (só `notification=<token>`). */
export const EFI_NOTIFICATION_MAX_BODY_BYTES = 4 * 1024;
/** Caminho público da `notification_url` da Efí (sem a query `?secret=`). */
export const EFI_NOTIFICATION_PATH = "/webhooks/efi";
/**
 * Tentativa sem desfecho (chamada sem resposta ou nunca enviada) vira `declined`
 * (`provider_unavailable`) depois disso: libera "Tentar outro cartão". Se o provedor tiver cobrado,
 * a confirmação canônica que chegar depois ainda marca pago (sem outra tentativa viva).
 */
export const CARD_PROCESSING_GIVE_UP_MS = 5 * 60_000;
/** Consulta autenticada no máximo a cada 60 s por Pedido aberto com Cartão em análise. */
export const CARD_RECONCILE_INTERVAL_MS = 60_000;

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
  /** CPF da conta do Consumidor pela sessão (`useAccountCpf`, Ticket 13); ausente = sem conta. */
  accountCpfOf?: (cookie: string | null) => Promise<string | null>;
  /**
   * Estorno (Ticket 12): Estorno tardio/órfão e conclusão pela notificação. Ausente = a obrigação
   * tardia fica gravada (o Cron executa) e o `refunded` da Efí é registrado `deferred`.
   */
  refunds?: Pick<RefundService, "afterPayment" | "orphanCardCharge" | "confirmFromWebhook"> | null;
  now?: () => Date;
};

export type CardReply = {
  status: 200 | 201 | 400 | 404 | 409 | 422;
  /** `cardRetryResponseSchema` de @foode/shared/payment. */
  body: CardRetryResponse;
};

export type CardWebhookReply = {
  status: 200 | 400 | 401 | 503;
  body: { ok: true; outcome: string } | { error: string };
};

/** O que a página do Pedido precisa saber da Loja agora para montar as ações do recusado. */
export type CardViewOptions = { tokenizer: CardTokenizer | null; pixAvailable: boolean };

export type CardService = {
  /** Tokenizador do modo da Loja; null = Crédito indisponível (modo sem chaves ou sem modo). */
  tokenizerFor(mode: CardMode | null): CardTokenizer | null;
  /** Crédito pode aparecer no checkout (falta ainda a taxa Foode vigente, em checkout-rules). */
  available(mode: CardMode | null): boolean;
  /**
   * Depois de gravar o Pedido `credit`: cobra a tentativa inicial no provedor gravado na intenção,
   * com o CPF já resolvido (digitado ou da conta). Nunca lança; recusa vira `declined` com motivo.
   * Replay da criação não cobra de novo (a tentativa já foi reservada).
   */
  chargeForOrder(orderId: string, card: CardPaymentInput, payerCpf: string): Promise<void>;
  /** Bloco do Cartão da página do Pedido (última tentativa); null fora do `credit`. */
  viewForOrder(orderId: string, options: CardViewOptions): Promise<OrderCard | null>;
  /**
   * `POST /storefront/lojas/:slug/pedidos/:token/cartao`: corpo `cardRetryRequestSchema`. 201
   * nova tentativa, 200 replay (mesma `attemptKey`), 409 `attempt_active`/`order_not_payable`,
   * 422 `payment_method_unavailable` (modo mudou, sem chaves ou sem taxa) ou
   * `account_cpf_unavailable` (`useAccountCpf` sem sessão com CPF), 404 `order_not_found`,
   * 400 `invalid_input`. Corpo da resposta: `cardRetryResponseSchema`.
   */
  retry(input: {
    slug: string;
    token: string;
    body: unknown;
    cookie?: string | null;
  }): Promise<CardReply>;
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

function warn(message: string, fields: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "warn", message, ...fields }));
}

function errorCode(error: unknown): string {
  if (isAbacatePayError(error) || isEfiError(error)) {
    return `${error.kind}:${error.code}`.slice(0, 80);
  }
  return error instanceof Error ? error.name.slice(0, 80) : "unknown";
}

/** Telefone nacional (DDD + número) a partir do E.164 brasileiro. */
export function nationalPhone(e164: string): string {
  const digits = e164.replace(/\D/gu, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
}

/** Motivo exibível de um erro DEFINITIVO do provedor na criação; null = incerto (aguardar). */
export function declineReasonOfError(error: unknown): CardDeclineReason | null {
  if (isEfiError(error)) {
    if (error.uncertain) return null;
    if (error.kind === "validation" || error.kind === "invalid_state") {
      const property = error.property ?? "";
      if (/payment_token/u.test(property)) return "token_expired";
      if (/customer|cpf|email|birth|phone|name/u.test(property)) return "invalid_payer_data";
      return "unknown";
    }
    return error.retriable ? "provider_unavailable" : "unknown";
  }
  if (isAbacatePayError(error)) {
    if (error.uncertain) return null;
    if (error.kind === "card_declined") return "issuer_declined";
    return error.retriable ? "provider_unavailable" : "unknown";
  }
  // TypeError dos clientes (entrada recusada antes da chamada): nada saiu daqui.
  return error instanceof TypeError ? "unknown" : null;
}

/** Bloco público do Cartão (estado, valor, ações do recusado). */
export function toOrderCard(intent: CardIntentView, options: CardViewOptions): OrderCard {
  const declined = intent.state === "declined";
  const retryActions: CardRetryAction[] = declined
    ? [
        ...(options.tokenizer ? (["other_card"] as const) : []),
        ...(options.pixAvailable ? (["pix"] as const) : []),
      ]
    : [];
  return {
    state: intent.state,
    amountCents: intent.amountCents,
    brand: intent.brand,
    lastFour: intent.lastFour,
    declineReason: declined ? (intent.declineReason ?? "unknown") : null,
    retryActions,
    tokenizer: declined ? options.tokenizer : null,
  };
}

type Outcome =
  | "applied"
  | "already_applied"
  | "duplicate"
  | "pending"
  | "declined"
  | "deferred"
  | "amount_mismatch"
  | "unmatched";

export function createCardService(deps: CardServiceDeps): CardService {
  const { db, efi, abacatePay } = deps;
  const clock = deps.now ?? (() => new Date());

  function tokenizerFor(mode: CardMode | null): CardTokenizer | null {
    if (mode === "normal" && efi) {
      return { sdk: "efi", payeeCode: efi.payeeCode, environment: efi.environment };
    }
    if (mode === "rapido" && abacatePay) {
      return { sdk: "abacatepay", publicKey: abacatePay.publicKey };
    }
    return null;
  }

  async function recordEvent(
    event: WebhookEventInput,
    providerChargeId: string | null,
    intentId: string | null,
    outcome: "deferred" | "unmatched" | "amount_mismatch" | "ignored",
  ) {
    await db.payments.recordWebhookEvent({
      ...event,
      eventType: event.eventType.slice(0, 80),
      providerChargeId,
      intentId,
      outcome,
    });
  }

  /** Custo do provedor: o informado por ele; senão a tabela vigente do Ops; senão null. */
  async function providerCost(intent: CardIntentView, reported: number | null, at: string) {
    if (reported !== null && Number.isSafeInteger(reported) && reported >= 0) {
      return Math.min(reported, intent.amountCents);
    }
    const rate = await db.payments.providerCostAt(intent.provider, "card_charge", at);
    return rate ? feeCents(intent.amountCents, rate) : null;
  }

  /** Confirmação canônica: um único caminho para o dinheiro (Ledger + liberação + retenções). */
  async function confirm(
    intent: CardIntentView,
    input: {
      providerChargeId: string;
      providerStatus: string;
      providerFeeCents: number | null;
      event: WebhookEventInput | null;
    },
  ): Promise<Outcome> {
    const approvedAt = clock();
    const approvedAtIso = approvedAt.toISOString();
    const { ledger, release, retentions } = cardLedger({
      provider: intent.provider,
      orderTotalCents: intent.amountCents - intent.serviceFeeCents,
      serviceFeeCents: intent.serviceFeeCents,
      foodeFee: intent.foodeFee,
      providerCostCents: await providerCost(
        intent,
        input.providerFeeCents ?? intent.providerFeeCents,
        approvedAtIso,
      ),
      approvedAt,
    });
    const result = await db.cardPayments.confirm({
      intentId: intent.intentId,
      providerChargeId: input.providerChargeId,
      amountCents: intent.amountCents,
      approvedAt: approvedAtIso,
      providerStatus: input.providerStatus,
      providerFeeCents: input.providerFeeCents,
      expectedReleaseDate: release.releaseDate,
      releaseSource: release.releaseSource,
      ledger,
      retentions,
      event: input.event,
    });
    if (result === "rejected") {
      // Cobrança diferente da intenção ou outra tentativa já viva: conferência do Ops.
      warn("card_confirm_rejected", { provider: intent.provider });
      if (input.event) {
        await recordEvent(input.event, input.providerChargeId, intent.intentId, "unmatched");
      }
      // Dinheiro entrou numa tentativa recusada sem Pedido a pagar (trocou para PIX, outra
      // tentativa paga ou cancelado): Estorno total da cobrança (Ticket 12).
      await afterRefundable(() =>
        deps.refunds?.orphanCardCharge({
          intentId: intent.intentId,
          providerChargeId: input.providerChargeId,
        }),
      );
      return "unmatched";
    }
    if (result === "applied") {
      // Aprovado depois do cancelamento: a obrigação já está gravada; executa (Ticket 12).
      await afterRefundable(() => deps.refunds?.afterPayment(intent.intentId));
    }
    return result;
  }

  /** Estorno disparado por uma confirmação: nunca derruba o webhook (falha = retentável). */
  async function afterRefundable(run: () => Promise<void> | undefined) {
    try {
      await run();
    } catch (error) {
      warn("card_refund_dispatch_failed", { code: errorCode(error) });
    }
  }

  /** Efí `refunded` numa notificação: conclui o Estorno do cancelamento (idempotente). */
  async function confirmEfiRefund(chargeId: string, event: WebhookEventInput): Promise<Outcome> {
    if (!deps.refunds) {
      await recordEvent(event, chargeId, null, "deferred");
      return "deferred";
    }
    return deps.refunds.confirmFromWebhook({ providerChargeId: chargeId, event });
  }

  async function decline(
    intent: CardIntentView,
    reason: CardDeclineReason,
    input: {
      providerChargeId: string | null;
      providerStatus: string | null;
      failureCode: string;
      event: WebhookEventInput | null;
    },
  ): Promise<Outcome> {
    await db.cardPayments.decline({ intentId: intent.intentId, reason, ...input });
    return "declined";
  }

  /** Aplica um status da Efí (resposta do one-step, consulta ou notificação). */
  async function applyEfiStatus(
    intent: CardIntentView,
    input: {
      chargeId: string;
      status: string;
      amountCents: number | null;
      event: WebhookEventInput | null;
    },
  ): Promise<Outcome> {
    const { chargeId, status, event } = input;
    if (isEfiPaidForOrder(status, EFI_CARD_PAID_POLICY)) {
      if (input.amountCents !== null && input.amountCents !== intent.amountCents) {
        warn("efi_card_amount_mismatch");
        if (event) await recordEvent(event, chargeId, intent.intentId, "amount_mismatch");
        return "amount_mismatch";
      }
      return confirm(intent, {
        providerChargeId: chargeId,
        providerStatus: status,
        providerFeeCents: null,
        event,
      });
    }
    const outcome = classifyEfiChargeStatus(status);
    if (outcome === "declined" || outcome === "canceled") {
      return decline(intent, "issuer_declined", {
        providerChargeId: chargeId,
        providerStatus: status,
        failureCode: `efi:${status}`,
        event,
      });
    }
    if (outcome === "pending" || outcome === "unknown") {
      await db.cardPayments.recordCharge({
        intentId: intent.intentId,
        providerChargeId: chargeId,
        providerStatus: status,
        state: "pending",
        providerFeeCents: null,
        devMode: efi?.environment === "sandbox",
      });
      if (event) await recordEvent(event, chargeId, intent.intentId, "deferred");
      return "pending";
    }
    // Estorno concluído (Ticket 12); contestação depois de pago fica registrada.
    if (outcome === "refunded" && event) return confirmEfiRefund(chargeId, event);
    if (event) await recordEvent(event, chargeId, intent.intentId, "deferred");
    return "deferred";
  }

  /** Aplica um status da AbacatePay (resposta da criação, consulta ou webhook). */
  async function applyAbacatePayStatus(
    intent: CardIntentView,
    input: {
      chargeId: string;
      status: string;
      amountCents: number;
      providerFeeCents: number | null;
      devMode: boolean;
      event: WebhookEventInput | null;
    },
  ): Promise<Outcome> {
    const status = input.status.toUpperCase();
    const { chargeId, event } = input;
    if (status === "APPROVED" || status === "PAID") {
      if (input.amountCents !== intent.amountCents) {
        warn("abacatepay_card_amount_mismatch");
        if (event) await recordEvent(event, chargeId, intent.intentId, "amount_mismatch");
        return "amount_mismatch";
      }
      return confirm(intent, {
        providerChargeId: chargeId,
        providerStatus: status,
        providerFeeCents: input.providerFeeCents,
        event,
      });
    }
    if (status === "FAILED") {
      return decline(intent, "issuer_declined", {
        providerChargeId: chargeId,
        providerStatus: status,
        failureCode: "abacatepay:FAILED",
        event,
      });
    }
    if (status === "PENDING") {
      await db.cardPayments.recordCharge({
        intentId: intent.intentId,
        providerChargeId: chargeId,
        providerStatus: status,
        state: "pending",
        providerFeeCents: input.providerFeeCents,
        devMode: input.devMode,
      });
      if (event) await recordEvent(event, chargeId, intent.intentId, "deferred");
      return "pending";
    }
    if (event) await recordEvent(event, chargeId, intent.intentId, "deferred");
    return "deferred";
  }

  /** Chamada única ao provedor da tentativa (reservada antes; o token é de uso único). */
  async function charge(intent: CardIntentView, card: CardPaymentInput, cpf: string) {
    if (intent.intentState !== "creating" || intent.providerChargeId) return;
    if (card.sdk !== intent.provider) {
      // O SDK do navegador não é o do provedor gravado (modo trocado no meio): nada é enviado.
      await decline(intent, "unknown", {
        providerChargeId: null,
        providerStatus: null,
        failureCode: "sdk_mismatch",
        event: null,
      });
      return;
    }
    if (!(await db.cardPayments.claimChargeAttempt(intent.intentId, clock().toISOString()))) {
      return;
    }
    try {
      if (card.sdk === "efi") {
        if (!efi) throw new TypeError("efi_unavailable");
        const result = await efi.gateway.createCardCharge({
          customId: intent.intentId,
          amountCents: intent.amountCents,
          itemName: `Pedido #${intent.orderCode}`,
          paymentToken: card.paymentToken,
          customer: {
            name: intent.customerName,
            cpf,
            email: card.payer.email,
            phoneNumber: nationalPhone(intent.customerPhoneE164),
            birth: card.payer.birthDate,
          },
          notificationUrl: `${efi.notificationUrl}?${EFI_SECRET_QUERY_PARAM}=${encodeURIComponent(
            efi.notificationSecret,
          )}`,
        });
        await applyEfiStatus(intent, {
          chargeId: String(result.chargeId),
          status: result.status,
          amountCents: result.totalCents,
          event: null,
        });
      } else {
        if (!abacatePay) throw new TypeError("abacatepay_unavailable");
        const result = await abacatePay.gateway.createCardCharge({
          intentId: intent.intentId,
          amountCents: intent.amountCents,
          token: card.token,
          customer: {
            name: intent.customerName,
            email: card.payer.email,
            taxId: cpf,
            cellphone: nationalPhone(intent.customerPhoneE164),
          },
        });
        await applyAbacatePayStatus(intent, {
          chargeId: result.id,
          status: result.status,
          amountCents: result.amountCents,
          providerFeeCents: result.platformFeeCents,
          devMode: result.devMode,
          event: null,
        });
      }
    } catch (error) {
      const code = errorCode(error);
      warn("card_charge_failed", { provider: intent.provider, code });
      const reason = declineReasonOfError(error);
      // Incerto (timeout/rede/resposta ilegível): fica `processing`; webhook ou prazo decidem.
      if (reason) {
        await decline(intent, reason, {
          providerChargeId: null,
          providerStatus: null,
          failureCode: code,
          event: null,
        });
      }
    }
  }

  /** Consulta autenticada de uma tentativa em análise (limitada por `checkedAt`). */
  async function reconcile(intent: CardIntentView) {
    if (intent.intentState !== "pending" || !intent.providerChargeId) return;
    const now = clock();
    const lastCheck = intent.checkedAt ? Date.parse(intent.checkedAt) : 0;
    if (now.getTime() - lastCheck < CARD_RECONCILE_INTERVAL_MS) return;
    await db.cardPayments.markChecked(intent.intentId, now.toISOString());
    if (intent.provider === "efi" && efi) {
      const chargeId = Number(intent.providerChargeId);
      if (!Number.isSafeInteger(chargeId)) return;
      const current = await efi.gateway.getCharge(chargeId);
      await applyEfiStatus(intent, {
        chargeId: intent.providerChargeId,
        status: current.status,
        amountCents: current.totalCents,
        event: null,
      });
    } else if (intent.provider === "abacatepay" && abacatePay) {
      const current = await abacatePay.gateway.getCardCharge(intent.providerChargeId);
      await applyAbacatePayStatus(intent, {
        chargeId: intent.providerChargeId,
        status: current.status,
        amountCents: current.amountCents,
        providerFeeCents: current.platformFeeCents,
        devMode: current.devMode,
        event: null,
      });
    }
  }

  /** Tentativa sem desfecho além do prazo: recusada como indisponível (libera outra). */
  async function giveUpIfStale(intent: CardIntentView) {
    if (intent.intentState !== "creating") return;
    const since = Date.parse(intent.attemptStartedAt ?? intent.createdAt);
    if (clock().getTime() - since <= CARD_PROCESSING_GIVE_UP_MS) return;
    await decline(intent, "provider_unavailable", {
      providerChargeId: null,
      providerStatus: null,
      failureCode: "give_up",
      event: null,
    });
  }

  /** Intenção Efí da notificação: pelo token, pela cobrança ou pelo custom_id (= intentId). */
  async function efiIntentOf(token: string, events: EfiNotificationEvent[]) {
    const byToken = await db.cardPayments.byEfiNotificationToken(token);
    if (byToken) return byToken;
    for (const event of [...events].reverse()) {
      if (event.chargeId !== null) {
        const byCharge = await db.cardPayments.byProviderCharge("efi", String(event.chargeId));
        if (byCharge) return byCharge;
      }
      if (event.customId) {
        const byCustomId = await db.cardPayments.byIntentId(event.customId);
        if (
          byCustomId?.provider === "efi" &&
          (byCustomId.providerChargeId === null ||
            event.chargeId === null ||
            byCustomId.providerChargeId === String(event.chargeId))
        ) {
          return byCustomId;
        }
      }
    }
    return null;
  }

  return {
    tokenizerFor,
    available: (mode) => tokenizerFor(mode) !== null,

    async chargeForOrder(orderId, card, payerCpf) {
      try {
        const intent = await db.cardPayments.latestOfOrder(orderId);
        if (intent) await charge(intent, card, payerCpf);
      } catch (error) {
        warn("card_charge_ensure_failed", { code: errorCode(error) });
      }
    },

    async viewForOrder(orderId, options) {
      let intent = await db.cardPayments.latestOfOrder(orderId);
      if (!intent) return null;
      try {
        if (intent.intentState === "creating") await giveUpIfStale(intent);
        else if (intent.intentState === "pending") await reconcile(intent);
      } catch (error) {
        warn("card_view_refresh_failed", { code: errorCode(error) });
      }
      intent = (await db.cardPayments.byIntentId(intent.intentId)) ?? intent;
      return toOrderCard(intent, options);
    },

    async retry(input) {
      const invalid = { status: 400, body: { error: "invalid_input" } } as const;
      const notFound = { status: 404, body: { error: "order_not_found" } } as const;
      const unavailable = { status: 422, body: { error: "payment_method_unavailable" } } as const;
      const parsed = cardRetryRequestSchema.safeParse(input.body);
      if (!parsed.success) return invalid;
      if (!orderAccessTokenSchema.safeParse(input.token).success) return notFound;
      const found = await db.storefront.orderByTokenHash(input.slug, await sha256Hex(input.token));
      if (!found) return notFound;
      const { attemptKey, card } = parsed.data;
      const trackingPath = orderTrackingPath(found.store.slug, input.token);
      // Mesma chave = mesma tentativa (sem nova cobrança), mesmo que a Loja tenha mudado depois.
      if (await db.cardPayments.byAttempt(found.order.id, attemptKey)) {
        return { status: 200, body: { ok: true, trackingPath } };
      }
      if (found.order.paymentMethod !== "credit" || found.order.status === "cancelled") {
        return { status: 409, body: { error: "order_not_payable" } };
      }
      const state = await db.storefront.operationBySlug(input.slug);
      if (!state) return notFound;
      const fees = await db.checkout.effectivePaymentFees(state.store.id);
      const fee = fees.find((candidate) => candidate.method === "credit");
      const tokenizer = tokenizerFor(fee?.cardMode ?? null);
      if (!fee?.cardMode || !tokenizer || tokenizer.sdk !== card.sdk) return unavailable;
      const accountCpf = card.payer.useAccountCpf
        ? ((await deps.accountCpfOf?.(input.cookie ?? null)) ?? null)
        : null;
      const cpf = resolvePayerCpf(card.payer, accountCpf);
      if (!cpf) return { status: 422, body: { error: "account_cpf_unavailable" } };
      const created = await db.cardPayments.createAttempt({
        orderId: found.order.id,
        attemptKey,
        provider: tokenizer.sdk,
        cardMode: fee.cardMode,
        foodeFee: { feeId: fee.feeId, percentBps: fee.percentBps, fixedCents: fee.fixedCents },
        brand: card.brand,
        lastFour: card.lastFour,
      });
      if (!created.ok) return { status: 409, body: { error: created.error } };
      if (created.replayed) return { status: 200, body: { ok: true, trackingPath } };
      const intent = await db.cardPayments.byIntentId(created.intentId);
      if (intent) {
        try {
          await charge(intent, card, cpf);
        } catch (error) {
          warn("card_retry_charge_failed", { code: errorCode(error) });
        }
      }
      return { status: 201, body: { ok: true, trackingPath } };
    },

    async handleEfiNotification(input) {
      if (!efi) return { status: 503, body: { error: "card_unavailable" } };
      if (!(await verifyEfiNotificationSecret(input.querySecret, efi.notificationSecret))) {
        warn("efi_notification_unauthorized");
        return { status: 401, body: { error: "unauthorized" } };
      }
      const token = parseEfiNotificationToken(input.rawBody, input.contentType);
      if (!token) {
        warn("efi_notification_invalid_payload");
        return { status: 400, body: { error: "invalid_payload" } };
      }
      let events: EfiNotificationEvent[];
      try {
        events = await efi.gateway.getNotification(token);
      } catch (error) {
        // A Efí reenvia: 503 pede outra entrega.
        warn("efi_notification_fetch_failed", { code: errorCode(error) });
        return { status: 503, body: { error: "provider_unavailable" } };
      }
      const last = events[events.length - 1];
      if (!last) return { status: 200, body: { ok: true, outcome: "ignored" } };
      const eventOf = (event: EfiNotificationEvent): WebhookEventInput => ({
        provider: "efi",
        eventId: efiEventKey(event),
        eventType: `${event.type}:${event.currentStatus}`,
        devMode: efi.environment === "sandbox",
      });
      const intent = await efiIntentOf(token, events);
      if (!intent) {
        warn("efi_notification_unmatched");
        await recordEvent(eventOf(last), last.chargeId?.toString() ?? null, null, "unmatched");
        return { status: 200, body: { ok: true, outcome: "unmatched" } };
      }
      const ofThisCharge = events.filter(
        (event) =>
          event.chargeId === null ||
          intent.providerChargeId === null ||
          String(event.chargeId) === intent.providerChargeId,
      );
      const unseen = unseenEfiEvents(ofThisCharge, intent.efiLastEventId);
      const newest = unseen[unseen.length - 1];
      if (!newest) {
        if (intent.efiLastEventId !== null) {
          await db.cardPayments.advanceEfiEvents(intent.intentId, intent.efiLastEventId, token);
        }
        return { status: 200, body: { ok: true, outcome: "duplicate" } };
      }
      // Histórico cumulativo, possivelmente fora de ordem: a aprovação vence o que vier depois
      // (recusa/estorno depois de pago não regridem; ficam registrados para o Ticket 12).
      const decisive =
        unseen.find((event) => isEfiPaidForOrder(event.currentStatus, EFI_CARD_PAID_POLICY)) ??
        newest;
      const chargeId = decisive.chargeId?.toString() ?? intent.providerChargeId;
      let outcome: Outcome;
      if (!chargeId) {
        await recordEvent(eventOf(decisive), null, intent.intentId, "unmatched");
        outcome = "unmatched";
      } else {
        outcome = await applyEfiStatus(intent, {
          chargeId,
          status: decisive.currentStatus,
          amountCents: decisive.valueCents,
          event: eventOf(decisive),
        });
      }
      for (const event of unseen) {
        if (event === decisive) continue;
        if (chargeId && classifyEfiChargeStatus(event.currentStatus) === "refunded") {
          await confirmEfiRefund(chargeId, eventOf(event));
        } else {
          await recordEvent(eventOf(event), chargeId, intent.intentId, "deferred");
        }
      }
      await db.cardPayments.advanceEfiEvents(intent.intentId, newest.id, token);
      return { status: 200, body: { ok: true, outcome } };
    },

    async handleAbacatePayCardEvent(event) {
      const { charge: data } = event;
      const webhookEvent: WebhookEventInput = {
        provider: "abacatepay",
        eventId: event.eventId,
        eventType: event.type,
        devMode: event.devMode,
      };
      const byCharge = await db.cardPayments.byProviderCharge("abacatepay", data.id);
      const byMetadata =
        !byCharge && data.intentId ? await db.cardPayments.byIntentId(data.intentId) : null;
      const intent =
        byCharge ??
        (byMetadata?.provider === "abacatepay" &&
        (!byMetadata.providerChargeId || byMetadata.providerChargeId === data.id)
          ? byMetadata
          : null);
      if (!intent) {
        warn("abacatepay_card_webhook_unmatched");
        await recordEvent(webhookEvent, data.id, null, "unmatched");
        return { status: 200, body: { ok: true, outcome: "unmatched" } };
      }
      if (event.type !== "transparent.completed") {
        // Disputa/perda (o `transparent.refunded` é concluído antes, no handler do PIX, quando o
        // Estorno está ligado): registrado, sem efeito no dinheiro aqui.
        await recordEvent(webhookEvent, data.id, intent.intentId, "deferred");
        return { status: 200, body: { ok: true, outcome: "deferred" } };
      }
      const outcome = await applyAbacatePayStatus(intent, {
        chargeId: data.id,
        status: data.status,
        amountCents: data.amountCents,
        providerFeeCents: data.platformFeeCents,
        devMode: event.devMode,
        event: webhookEvent,
      });
      return { status: 200, body: { ok: true, outcome } };
    },
  };
}
