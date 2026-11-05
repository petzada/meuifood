// PIX pela AbacatePay ponta a ponta (Ticket 26; decisões 60, 61 e 71; ADR 0007). Regras aqui,
// HTTP em app.ts, escrita em @foode/db (`db.payments`), dinheiro em @foode/shared/payment.
//
// - Disponível só com as três chaves (API, segredo do webhook, chave de assinatura) — sem elas o
//   meio some do checkout — e com taxa Foode vigente (checkout-rules).
// - Idempotência nossa: a intenção nasce na MESMA escrita do Pedido; a cobrança só é criada sob
//   lease (`claimChargeAttempt`) e nunca é sobrescrita depois de gravada. Timeout/rede deixam a
//   intenção `creating`; a próxima leitura tenta de novo depois do lease (a cobrança órfã nunca
//   foi mostrada, então não pode ser paga). Erro definitivo = `failed`.
// - Confirmação: webhook (segredo da URL + HMAC) ou consulta autenticada (página do Pedido aberta
//   e QR vencido no relógio). Ambas convergem em `db.payments.confirmPayment`: evento único,
//   intenção `paid`, Pedido `paid` (entra na fila do Painel) e um lançamento no Ledger.
// - Nada de corpo, URL com segredo, copia-e-cola ou dado do pagador em log/Sentry: os logs levam
//   só códigos curtos.
import type { FoodeDb, PixIntentView } from "@foode/db";
import {
  feeCents,
  type OrderPix,
  PIX_EXPIRES_IN_SECONDS,
  paymentLedgerSnapshot,
  safePixQrDataUrl,
} from "@foode/shared/payment";

import type { CardService } from "./card-service";
import type { Env } from "./env";
import {
  type AbacatePayPixCharge,
  type AbacatePayPixCheck,
  createAbacatePayClient,
  type FetchLike,
} from "./providers/abacatepay/client";
import { isAbacatePayError } from "./providers/abacatepay/errors";
import {
  ABACATEPAY_SECRET_QUERY_PARAM,
  ABACATEPAY_SIGNATURE_HEADER,
  AbacatePayWebhookPayloadError,
  parseAbacatePayWebhook,
  verifyAbacatePayWebhook,
} from "./providers/abacatepay/webhook";

export { ABACATEPAY_SECRET_QUERY_PARAM, ABACATEPAY_SIGNATURE_HEADER };

/** Lease da criação da cobrança: outra tentativa só depois disso. */
export const PIX_CHARGE_LEASE_MS = 30_000;
/** Cobrança que não sai em 10 min (provedor fora) vira `failed`: o Consumidor refaz o Pedido. */
export const PIX_CREATE_GIVE_UP_MS = 10 * 60_000;
/** Consulta autenticada no máximo a cada 60 s por Pedido aberto (reconciliação sem webhook). */
export const PIX_RECONCILE_INTERVAL_MS = 60_000;

/** O que o PIX usa do provedor (o cliente real ou um fake nos testes). */
export type PixGateway = {
  createPixCharge(input: {
    intentId: string;
    amountCents: number;
    description?: string;
    expiresInSeconds?: number;
    metadata?: Record<string, string>;
  }): Promise<AbacatePayPixCharge>;
  checkPixCharge(id: string): Promise<AbacatePayPixCheck>;
};

export type AbacatePayWebhookConfig = { webhookSecret: string; signingKey: string };

/** Cliente + segredos do webhook; null quando falta qualquer chave (PIX indisponível). */
export function abacatePayFromEnv(
  env: Pick<Env, "ABACATEPAY_API_KEY" | "ABACATEPAY_WEBHOOK_SECRET" | "ABACATEPAY_SIGNING_KEY">,
  fetch?: FetchLike,
): { gateway: PixGateway; webhook: AbacatePayWebhookConfig } | null {
  const apiKey = env.ABACATEPAY_API_KEY?.trim();
  const webhookSecret = env.ABACATEPAY_WEBHOOK_SECRET?.trim();
  const signingKey = env.ABACATEPAY_SIGNING_KEY?.trim();
  if (!apiKey || !webhookSecret || !signingKey) return null;
  return {
    gateway: createAbacatePayClient({ apiKey, ...(fetch ? { fetch } : {}) }),
    webhook: { webhookSecret, signingKey },
  };
}

export type PixServiceDeps = {
  db: FoodeDb;
  provider: { gateway: PixGateway; webhook: AbacatePayWebhookConfig } | null;
  /**
   * Cartão Rápido (Ticket 27): eventos `method: "CARD"` do mesmo webhook vão para cá. Ausente =
   * registrados como `deferred`, sem efeito no dinheiro.
   */
  card?: Pick<CardService, "handleAbacatePayCardEvent"> | null;
  now?: () => Date;
};

export type WebhookReply = {
  status: 200 | 400 | 401 | 503;
  body: { ok: true; outcome: string } | { error: string };
};

function warn(message: string, fields: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "warn", message, ...fields }));
}

function errorCode(error: unknown): string {
  if (isAbacatePayError(error)) return `${error.kind}:${error.code}`.slice(0, 80);
  return error instanceof Error ? error.name.slice(0, 80) : "unknown";
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function toOrderPix(intent: PixIntentView): OrderPix {
  const showCode = intent.state === "pending";
  return {
    state: intent.state,
    amountCents: intent.amountCents,
    copyPaste: showCode ? intent.copyPaste : null,
    qrCodeDataUrl: showCode ? safePixQrDataUrl(intent.qrCode) : null,
    expiresAt: intent.state === "pending" || intent.state === "expired" ? intent.expiresAt : null,
  };
}

export function createPixService(deps: PixServiceDeps) {
  const { db, provider } = deps;
  const clock = deps.now ?? (() => new Date());

  /** Custo do provedor: o informado por ele; senão a tabela vigente do Ops; senão null. */
  async function providerCost(
    reportedCents: number | null,
    chargedCents: number,
    at: string,
  ): Promise<number | null> {
    if (reportedCents !== null && Number.isSafeInteger(reportedCents) && reportedCents >= 0) {
      return Math.min(reportedCents, chargedCents);
    }
    const rate = await db.payments.providerCostAt("abacatepay", "pix_charge", at);
    return rate ? feeCents(chargedCents, rate) : null;
  }

  /** Pagamento confirmado (webhook ou consulta): um único caminho para o dinheiro. */
  async function confirm(
    intent: PixIntentView,
    input: {
      providerChargeId: string;
      amountCents: number;
      providerFeeCents: number | null;
      event: { eventId: string; eventType: string; devMode: boolean } | null;
    },
  ) {
    const paidAt = clock();
    const paidAtIso = paidAt.toISOString();
    const ledger = paymentLedgerSnapshot({
      orderTotalCents: intent.amountCents - intent.serviceFeeCents,
      serviceFeeCents: intent.serviceFeeCents,
      foodeFee: intent.foodeFee,
      providerCostCents: await providerCost(
        input.providerFeeCents ?? intent.providerFeeCents,
        intent.amountCents,
        paidAtIso,
      ),
      releasedAt: paidAt,
    });
    return db.payments.confirmPayment({
      intentId: intent.intentId,
      providerChargeId: input.providerChargeId,
      amountCents: input.amountCents,
      paidAt: paidAtIso,
      providerFeeCents: input.providerFeeCents,
      ledger,
      event: input.event ? { provider: "abacatepay", ...input.event } : null,
    });
  }

  /** Cria a cobrança se ainda não há uma (lease); falha definitiva marca `failed`. */
  async function ensureCharge(intent: PixIntentView): Promise<void> {
    if (!provider || intent.state !== "creating" || intent.providerChargeId) return;
    const now = clock();
    if (now.getTime() - Date.parse(intent.createdAt) > PIX_CREATE_GIVE_UP_MS) {
      await db.payments.failChargeAttempt(intent.intentId, "give_up");
      return;
    }
    const claimed = await db.payments.claimChargeAttempt(
      intent.intentId,
      now.toISOString(),
      new Date(now.getTime() - PIX_CHARGE_LEASE_MS).toISOString(),
    );
    if (!claimed) return;
    try {
      const charge = await provider.gateway.createPixCharge({
        intentId: intent.intentId,
        amountCents: intent.amountCents,
        description: "Pedido Foode",
        expiresInSeconds: PIX_EXPIRES_IN_SECONDS,
      });
      if (charge.amountCents !== intent.amountCents) {
        // Nunca mostrar um QR com valor diferente do Pedido.
        warn("pix_charge_amount_mismatch");
        await db.payments.failChargeAttempt(intent.intentId, "amount_mismatch");
        return;
      }
      await db.payments.recordPixCharge({
        intentId: intent.intentId,
        providerChargeId: charge.id,
        copyPaste: charge.brCode,
        qrCode: safePixQrDataUrl(charge.brCodeBase64),
        expiresAt:
          isoOrNull(charge.expiresAt) ??
          new Date(now.getTime() + PIX_EXPIRES_IN_SECONDS * 1000).toISOString(),
        providerFeeCents: charge.platformFeeCents,
        devMode: charge.devMode,
      });
    } catch (error) {
      const code = errorCode(error);
      warn("pix_charge_create_failed", { code });
      const definitive = isAbacatePayError(error) && !error.retriable && !error.uncertain;
      if (definitive) await db.payments.failChargeAttempt(intent.intentId, code);
      // Incerto/retriable: fica `creating`; a próxima leitura tenta de novo após o lease.
    }
  }

  /** Consulta autenticada: PAID confirma; EXPIRED/CANCELLED expira; senão só marca a consulta. */
  async function reconcile(intent: PixIntentView, force: boolean): Promise<void> {
    if (!provider || intent.state !== "pending" || !intent.providerChargeId) return;
    const now = clock();
    const lastCheck = intent.checkedAt ? Date.parse(intent.checkedAt) : 0;
    if (!force && now.getTime() - lastCheck < PIX_RECONCILE_INTERVAL_MS) return;
    await db.payments.markChecked(intent.intentId, now.toISOString());
    try {
      const check = await provider.gateway.checkPixCharge(intent.providerChargeId);
      if (check.status === "PAID") {
        await confirm(intent, {
          providerChargeId: intent.providerChargeId,
          amountCents: intent.amountCents,
          providerFeeCents: null,
          event: null,
        });
      } else if (check.status === "EXPIRED" || check.status === "CANCELLED") {
        await db.payments.expirePix(intent.intentId);
      }
    } catch (error) {
      warn("pix_charge_check_failed", { code: errorCode(error) });
    }
  }

  return {
    /** PIX pode aparecer no checkout (falta ainda a taxa Foode vigente, em checkout-rules). */
    available(): boolean {
      return provider !== null;
    },

    /** Depois de gravar o Pedido (e no replay): garante a cobrança. Nunca lança. */
    async ensureChargeForOrder(orderId: string): Promise<void> {
      try {
        const intent = await db.payments.pixIntentOfOrder(orderId);
        if (intent) await ensureCharge(intent);
      } catch (error) {
        warn("pix_charge_ensure_failed", { code: errorCode(error) });
      }
    },

    /**
     * Bloco do PIX da página do Pedido. Antes de responder: cobrança ainda não criada (lease
     * vencido) tenta de novo; QR vencido no relógio ou consulta periódica conferem no provedor.
     */
    async viewForOrder(orderId: string): Promise<OrderPix | null> {
      let intent = await db.payments.pixIntentOfOrder(orderId);
      if (!intent) return null;
      try {
        if (intent.state === "creating") {
          await ensureCharge(intent);
        } else if (intent.state === "pending") {
          const expired =
            intent.expiresAt !== null && Date.parse(intent.expiresAt) <= clock().getTime();
          await reconcile(intent, expired);
          if (expired) {
            const after = await db.payments.intentById(intent.intentId);
            // Provedor fora ou ainda PENDING depois do prazo: expira mesmo assim (sem QR válido).
            if (after?.state === "pending") await db.payments.expirePix(intent.intentId);
          }
        }
      } catch (error) {
        warn("pix_view_refresh_failed", { code: errorCode(error) });
      }
      intent = (await db.payments.intentById(intent.intentId)) ?? intent;
      return toOrderPix(intent);
    },

    /**
     * Webhook da AbacatePay. `rawBody` exatamente como recebido. 401 sem segredo/assinatura
     * válidos; 400 com payload ilegível; 200 em todo evento autenticado (aplicado, repetido,
     * ignorado ou registrado para conferência), para não provocar reentrega inútil.
     */
    async handleWebhook(input: {
      rawBody: string;
      querySecret: string | null;
      signature: string | null;
    }): Promise<WebhookReply> {
      if (!provider) return { status: 503, body: { error: "pix_unavailable" } };
      const authentic = await verifyAbacatePayWebhook({
        rawBody: input.rawBody,
        querySecret: input.querySecret,
        signatureHeader: input.signature,
        webhookSecret: provider.webhook.webhookSecret,
        signingKey: provider.webhook.signingKey,
      });
      if (!authentic) {
        warn("abacatepay_webhook_unauthorized");
        return { status: 401, body: { error: "unauthorized" } };
      }
      let event;
      try {
        event = parseAbacatePayWebhook(input.rawBody);
      } catch (error) {
        if (error instanceof AbacatePayWebhookPayloadError) {
          warn("abacatepay_webhook_invalid_payload");
          return { status: 400, body: { error: "invalid_payload" } };
        }
        throw error;
      }
      if (event.kind === "ignored") {
        if (event.eventId) {
          await db.payments.recordWebhookEvent({
            provider: "abacatepay",
            eventId: event.eventId,
            eventType: event.type.slice(0, 80),
            devMode: event.devMode,
            providerChargeId: null,
            intentId: null,
            outcome: "ignored",
          });
        }
        return { status: 200, body: { ok: true, outcome: "ignored" } };
      }
      if (await db.payments.webhookEventSeen("abacatepay", event.eventId)) {
        return { status: 200, body: { ok: true, outcome: "duplicate" } };
      }
      const { charge } = event;
      // Cartão Rápido (Ticket 27): mesmo webhook, idempotente pelo `log_…` (já conferido acima).
      if (charge.method === "CARD" && deps.card) {
        return deps.card.handleAbacatePayCardEvent(event);
      }
      const base = {
        provider: "abacatepay" as const,
        eventId: event.eventId,
        eventType: event.type,
        devMode: event.devMode,
        providerChargeId: charge.id,
      };
      // Cartão sem serviço, estorno/disputa (Ticket 12) e PIX "completed" sem status PAID:
      // registrados, sem efeito no dinheiro aqui.
      if (
        event.type !== "transparent.completed" ||
        charge.method !== "PIX" ||
        charge.status.toUpperCase() !== "PAID"
      ) {
        await db.payments.recordWebhookEvent({ ...base, intentId: null, outcome: "deferred" });
        return { status: 200, body: { ok: true, outcome: "deferred" } };
      }
      const byCharge = await db.payments.intentByProviderCharge("abacatepay", charge.id);
      const byMetadata =
        !byCharge && charge.intentId ? await db.payments.intentById(charge.intentId) : null;
      const intent =
        byCharge ??
        (byMetadata && (!byMetadata.providerChargeId || byMetadata.providerChargeId === charge.id)
          ? byMetadata
          : null);
      if (!intent) {
        warn("abacatepay_webhook_unmatched");
        await db.payments.recordWebhookEvent({ ...base, intentId: null, outcome: "unmatched" });
        return { status: 200, body: { ok: true, outcome: "unmatched" } };
      }
      if (charge.amountCents !== intent.amountCents) {
        // Valor diferente do cobrado: não confirma; fica registrado para o Ops conferir.
        warn("abacatepay_webhook_amount_mismatch");
        await db.payments.recordWebhookEvent({
          ...base,
          intentId: intent.intentId,
          outcome: "amount_mismatch",
        });
        return { status: 200, body: { ok: true, outcome: "amount_mismatch" } };
      }
      const result = await confirm(intent, {
        providerChargeId: charge.id,
        amountCents: charge.amountCents,
        providerFeeCents: charge.platformFeeCents,
        event: { eventId: event.eventId, eventType: event.type, devMode: event.devMode },
      });
      if (result === "applied") return { status: 200, body: { ok: true, outcome: "applied" } };
      // Já pago por outro evento/consulta (nada muda) ou recusado na escrita (cobrança ou valor
      // diferentes da intenção): fica registrado para conferência, sem efeito no dinheiro.
      const outcome = result === "already_applied" ? "already_applied" : "unmatched";
      if (outcome === "unmatched") warn("abacatepay_webhook_rejected");
      await db.payments.recordWebhookEvent({ ...base, intentId: intent.intentId, outcome });
      return { status: 200, body: { ok: true, outcome } };
    },
  };
}

export type PixService = ReturnType<typeof createPixService>;
