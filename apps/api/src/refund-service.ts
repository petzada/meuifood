// Estorno automático (Ticket 12; decisões 39, 60 e 71). A obrigação já está gravada (refund-db:
// no batch do cancelamento ou da confirmação tardia) ANTES de chegar aqui; este módulo só a
// executa no provedor que cobrou — lido da obrigação, nunca do request:
//
// - PIX e Cartão Rápido → AbacatePay `POST /transparents/refund` (sempre total; "já estornado" =
//   sucesso). Cartão Normal → Efí `POST /v1/charge/card/:id/refund` (sem valor = total); numa
//   retentativa, consulta antes (`refunded`/`canceled` = concluído) para nunca estornar duas vezes.
// - Uma chamada por vez (lease em `refunds.attempt_started_at`), estado só para frente. Provedor
//   aceitou → `requested`; a conclusão chega pelo webhook (`confirmFromWebhook`) ou pela consulta
//   autenticada de `retryPendingRefunds`. Falha → `failed` com backoff exponencial: o Pedido
//   continua cancelado e o Estorno continua devido (nunca desiste).
// - Observável sem dado sensível: log JSON e Sentry só com provedor, código curto do erro e
//   número de tentativas (nunca cobrança, Pedido, Consumidor ou corpo).
// `retryPendingRefunds(now)` é a função que o Cron do Ticket 15 chama.
import type { FoodeDb, RefundConfirmOutcome, RefundView, WebhookEventInput } from "@foode/db";
import { nextRefundAttemptAt } from "@foode/shared/payment";
import * as Sentry from "@sentry/cloudflare";

import type { Env } from "./env";
import {
  type AbacatePayCardCharge,
  type AbacatePayPixCheck,
  type AbacatePayRefundResult,
  createAbacatePayClient,
  type FetchLike,
  type RefundChargeInput,
} from "./providers/abacatepay/client";
import { isAbacatePayError } from "./providers/abacatepay/errors";
import {
  createEfiChargesClient,
  type EfiCardCharge,
  type EfiEnvironment,
  isEfiError,
} from "./providers/efi/client";
import { classifyEfiChargeStatus, isEfiCancelable } from "./providers/efi/status";

/** Lease da chamada ao provedor: outra tentativa só depois disso. */
export const REFUND_LEASE_MS = 60_000;
/** Estorno aceito sem confirmação: consulta autenticada no máximo a cada 15 min. */
export const REFUND_CHECK_INTERVAL_MS = 15 * 60_000;
/** Máximo de Estornos por rodada de `retryPendingRefunds` (cada fase). */
export const REFUND_BATCH_LIMIT = 25;
/** Motivo enviado à AbacatePay (texto fixo, sem dado do Pedido). */
export const REFUND_REASON = "Pedido cancelado pela Loja";

/** O que o Estorno usa da AbacatePay (cliente real ou fake nos testes). */
export type AbacatePayRefundGateway = {
  refundCharge(input: RefundChargeInput): Promise<AbacatePayRefundResult>;
  checkPixCharge(id: string): Promise<AbacatePayPixCheck>;
  getCardCharge(id: string): Promise<AbacatePayCardCharge>;
};

/** O que o Estorno usa da Efí (cliente real ou fake nos testes). */
export type EfiRefundGateway = {
  refundCardCharge(chargeId: number): Promise<void>;
  cancelCharge(chargeId: number): Promise<void>;
  getCharge(chargeId: number): Promise<EfiCardCharge>;
};

export type RefundGateways = {
  abacatePay: AbacatePayRefundGateway | null;
  efi: EfiRefundGateway | null;
};

function trimmed(value: string | undefined): string | null {
  const out = value?.trim();
  return out ? out : null;
}

/**
 * Clientes do Estorno a partir do ambiente: AbacatePay só com a chave da API; Efí só com as
 * credenciais da aplicação. Sem chave, o Estorno daquele provedor fica `failed` (retentável) e
 * aparece no Sentry até as chaves voltarem.
 */
export function refundGatewaysFromEnv(
  env: Pick<Env, "ABACATEPAY_API_KEY" | "EFI_CLIENT_ID" | "EFI_CLIENT_SECRET" | "EFI_ENVIRONMENT">,
  fetch?: FetchLike,
): RefundGateways {
  const apiKey = trimmed(env.ABACATEPAY_API_KEY);
  const clientId = trimmed(env.EFI_CLIENT_ID);
  const clientSecret = trimmed(env.EFI_CLIENT_SECRET);
  const environment: EfiEnvironment = env.EFI_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  return {
    abacatePay: apiKey ? createAbacatePayClient({ apiKey, ...(fetch ? { fetch } : {}) }) : null,
    efi:
      clientId && clientSecret
        ? createEfiChargesClient({
            clientId,
            clientSecret,
            environment,
            ...(fetch ? { fetch } : {}),
          })
        : null,
  };
}

/** Campos seguros para log/Sentry (nada de cobrança, Pedido ou Consumidor). */
export type RefundIncident = {
  message: "refund_failed" | "refund_check_failed" | "refund_webhook_unmatched";
  provider: "abacatepay" | "efi";
  code: string;
  attempts?: number;
};

function defaultReport(incident: RefundIncident) {
  console.warn(JSON.stringify({ level: "warn", ...incident }));
  Sentry.captureMessage(incident.message, {
    level: "warning",
    tags: {
      provider: incident.provider,
      code: incident.code,
      ...(incident.attempts !== undefined ? { attempts: String(incident.attempts) } : {}),
    },
  });
}

class RefundUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RefundUnavailableError";
  }
}

export function refundErrorCode(error: unknown): string {
  if (isAbacatePayError(error) || isEfiError(error)) {
    return `${error.kind}:${error.code}`.slice(0, 80);
  }
  if (error instanceof RefundUnavailableError) return error.code;
  return error instanceof Error ? error.name.slice(0, 80) : "unknown";
}

export type RefundServiceDeps = {
  db: FoodeDb;
  gateways: RefundGateways;
  now?: () => Date;
  /** Observabilidade (padrão: log JSON + Sentry), só com campos seguros. */
  report?: (incident: RefundIncident) => void;
};

export type RetryRefundsSummary = {
  /** Tentativas feitas nesta rodada. */
  attempted: number;
  succeeded: number;
  requested: number;
  failed: number;
  /** `requested` confirmados por consulta autenticada. */
  confirmed: number;
};

export function createRefundService(deps: RefundServiceDeps) {
  const { db, gateways } = deps;
  const clock = deps.now ?? (() => new Date());
  const report = deps.report ?? defaultReport;

  function efiChargeId(refund: RefundView): number {
    const id = Number(refund.providerChargeId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new RefundUnavailableError("invalid_charge");
    return id;
  }

  /** Efí: o Estorno já aconteceu (ou a cobrança nem chegou a ser capturada e foi cancelada)? */
  async function efiAlreadyDone(gateway: EfiRefundGateway, chargeId: number): Promise<boolean> {
    const outcome = classifyEfiChargeStatus((await gateway.getCharge(chargeId)).status);
    return outcome === "refunded" || outcome === "canceled";
  }

  /** Chamada ao provedor gravado. Devolve o desfecho imediato. */
  async function callProvider(
    refund: RefundView,
  ): Promise<{ done: boolean; providerRefundId: string | null }> {
    if (refund.provider === "abacatepay") {
      const gateway = gateways.abacatePay;
      if (!gateway) throw new RefundUnavailableError("abacatepay_unavailable");
      const result = await gateway.refundCharge({
        id: refund.providerChargeId,
        reason: REFUND_REASON,
      });
      const refunded = result.alreadyRefunded || result.status?.toUpperCase() === "REFUNDED";
      return { done: refunded, providerRefundId: result.id };
    }
    const gateway = gateways.efi;
    if (!gateway) throw new RefundUnavailableError("efi_unavailable");
    const chargeId = efiChargeId(refund);
    // Retentativa: a Efí não tem chave idempotente; confere antes de pedir de novo.
    if (refund.attempts > 0 && (await efiAlreadyDone(gateway, chargeId))) {
      return { done: true, providerRefundId: null };
    }
    try {
      await gateway.refundCardCharge(chargeId);
      return { done: false, providerRefundId: null };
    } catch (error) {
      // Recusado por estado: já estornada, ou ainda cancelável (sem captura) → cancela.
      if (isEfiError(error) && (error.kind === "invalid_state" || error.kind === "validation")) {
        const current = await gateway.getCharge(chargeId);
        const outcome = classifyEfiChargeStatus(current.status);
        if (outcome === "refunded" || outcome === "canceled") {
          return { done: true, providerRefundId: null };
        }
        if (isEfiCancelable(current.status)) {
          await gateway.cancelCharge(chargeId);
          return { done: true, providerRefundId: null };
        }
        // TODO(12): conferir no sandbox se a Efí estorna cartão `approved` (ainda não `paid`);
        // se recusar, a retentativa com backoff tenta de novo até a captura.
      }
      throw error;
    }
  }

  /**
   * Executa a obrigação (uma chamada por vez). Nunca lança: falha vira `failed` com a próxima
   * tentativa. Devolve o estado gravado depois.
   */
  async function execute(refundId: string, at: Date = clock()): Promise<RefundView | null> {
    const refund = await db.refunds.byId(refundId);
    if (!refund || (refund.state !== "pending" && refund.state !== "failed")) return refund;
    const nowIso = at.toISOString();
    const claimed = await db.refunds.claim(
      refundId,
      nowIso,
      new Date(at.getTime() - REFUND_LEASE_MS).toISOString(),
    );
    if (!claimed) return db.refunds.byId(refundId);
    try {
      const outcome = await callProvider(refund);
      if (outcome.done) await db.refunds.markSucceeded(refundId, outcome.providerRefundId);
      else await db.refunds.markRequested(refundId, outcome.providerRefundId);
    } catch (error) {
      const attempts = refund.attempts + 1;
      const code = refundErrorCode(error);
      await db.refunds.markFailed(refundId, code, nextRefundAttemptAt(at, attempts).toISOString());
      report({ message: "refund_failed", provider: refund.provider, code, attempts });
    }
    return db.refunds.byId(refundId);
  }

  /** Estorno aceito e sem webhook: consulta autenticada na cobrança. */
  async function check(refund: RefundView, at: Date): Promise<boolean> {
    await db.refunds.markChecked(refund.refundId, at.toISOString());
    let refunded = false;
    if (refund.provider === "abacatepay") {
      const gateway = gateways.abacatePay;
      if (!gateway) throw new RefundUnavailableError("abacatepay_unavailable");
      const status =
        refund.method === "pix"
          ? (await gateway.checkPixCharge(refund.providerChargeId)).status
          : (await gateway.getCardCharge(refund.providerChargeId)).status;
      refunded = status.toUpperCase() === "REFUNDED";
    } else {
      const gateway = gateways.efi;
      if (!gateway) throw new RefundUnavailableError("efi_unavailable");
      refunded = await efiAlreadyDone(gateway, efiChargeId(refund));
    }
    return refunded ? db.refunds.markSucceeded(refund.refundId) : false;
  }

  return {
    execute,

    /**
     * Rodada de retentativa (Cron do Ticket 15): Estornos pendentes/falhos fora do backoff e
     * Estornos aceitos sem confirmação. Uma falha não interrompe os demais.
     */
    async retryPendingRefunds(now: Date = clock()): Promise<RetryRefundsSummary> {
      const summary: RetryRefundsSummary = {
        attempted: 0,
        succeeded: 0,
        requested: 0,
        failed: 0,
        confirmed: 0,
      };
      const due = await db.refunds.dueForAttempt(
        now.toISOString(),
        new Date(now.getTime() - REFUND_LEASE_MS).toISOString(),
        REFUND_BATCH_LIMIT,
      );
      for (const refund of due) {
        summary.attempted += 1;
        const after = await execute(refund.refundId, now);
        if (after?.state === "succeeded") summary.succeeded += 1;
        else if (after?.state === "requested") summary.requested += 1;
        else summary.failed += 1;
      }
      const toCheck = await db.refunds.dueForCheck(
        new Date(now.getTime() - REFUND_CHECK_INTERVAL_MS).toISOString(),
        REFUND_BATCH_LIMIT,
      );
      for (const refund of toCheck) {
        try {
          if (await check(refund, now)) summary.confirmed += 1;
        } catch (error) {
          report({
            message: "refund_check_failed",
            provider: refund.provider,
            code: refundErrorCode(error),
          });
        }
      }
      return summary;
    },

    /** Depois de confirmar um pagamento: Pedido já cancelado → executa o Estorno tardio. */
    async afterPayment(intentId: string): Promise<void> {
      const refund = await db.refunds.ofIntent(intentId);
      if (refund && (refund.state === "pending" || refund.state === "failed")) {
        await execute(refund.refundId);
      }
    },

    /** Cartão aprovado sem Pedido a pagar (confirmação recusada): Estorno total da cobrança. */
    async orphanCardCharge(input: { intentId: string; providerChargeId: string }): Promise<void> {
      const refund = await db.refunds.refundOrphanCardCharge(input);
      if (refund && (refund.state === "pending" || refund.state === "failed")) {
        await execute(refund.refundId);
      }
    },

    /** Webhook de Estorno concluído, já autenticado pelo handler do provedor. Idempotente. */
    async confirmFromWebhook(input: {
      providerChargeId: string;
      event: WebhookEventInput;
    }): Promise<RefundConfirmOutcome> {
      const outcome = await db.refunds.confirmByProviderCharge(input);
      if (outcome === "unmatched") {
        report({
          message: "refund_webhook_unmatched",
          provider: input.event.provider,
          code: input.event.eventType.slice(0, 80),
        });
      }
      return outcome;
    },
  };
}

export type RefundService = ReturnType<typeof createRefundService>;
