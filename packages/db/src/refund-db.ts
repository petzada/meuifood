// Cancelamento com Estorno automático no D1 (Ticket 12, migration 0010). Duas portas:
//
// - `cancelOrderWithRefund` (StoreContext, Dono e Operador da própria Loja): UM `batch` grava o
//   histórico (quem e papel), o motivo (`order_cancellations`), o Pedido `cancelled`, a obrigação
//   de Estorno de cada cobrança PAGA (`refunds`, provedor/cobrança/valor copiados da intenção) e a
//   reversão do Ledger (`ledger_reversals`: anulação antes do repasse, débito compensado depois)
//   — tudo ANTES de qualquer chamada ao provedor. Só a partir de um estado ativo (e do `from` que
//   o Painel viu): já cancelado/concluído = `conflict`, nada gravado, nenhum segundo Estorno.
// - `createRefundOps` (sistema, sem StoreContext; a Loja sai sempre da obrigação gravada):
//   execução idempotente do Estorno (lease + estados só para frente), confirmação por webhook
//   (evento de identidade única), retentativa, cobrança órfã do Cartão e o cancelamento
//   automático do PIX vencido (libera o Cupom; Pedido cancelado sai da faixa de Pedidos).
// `lateRefundStatements` entra no `batch` da confirmação do pagamento (payment-db/card-payment-db):
// pagamento que chega depois do cancelamento converge para Estorno total no mesmo batch.
// Nada aqui registra log nem guarda corpo do provedor ou dado do pagador.
import { assertIssued, type StoreContext } from "./context";
import { newId, utcNow } from "./conventions";
import type { PaymentProviderName, WebhookEventInput } from "./payment-db";
import type {
  OperationResult,
  OrderFulfillment,
  OrderPaymentMethod,
  OrderStatus,
} from "./store-operation-db";
import {
  type OrderCancelReasonValue,
  type OrderPaymentStatus,
  PAINEL_VISIBLE_PAYMENT_SQL,
  type RefundOriginValue,
  type RefundStateValue,
} from "./schema";

export type RefundView = {
  refundId: string;
  storeId: string;
  orderId: string;
  intentId: string;
  idempotencyKey: string;
  provider: PaymentProviderName;
  method: "pix" | "credit";
  cardMode: "normal" | "rapido" | null;
  providerChargeId: string;
  /** Estorno total (Pedido + tarifa de serviço). */
  amountCents: number;
  serviceFeeCents: number;
  origin: RefundOriginValue;
  state: RefundStateValue;
  attempts: number;
  nextAttemptAt: string | null;
  attemptStartedAt: string | null;
  checkedAt: string | null;
  lastErrorCode: string | null;
  providerRefundId: string | null;
  requestedAt: string | null;
  succeededAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const REFUND_SELECT = `SELECT r.id AS refundId, r.store_id AS storeId, r.order_id AS orderId,
  r.intent_id AS intentId, r.idempotency_key AS idempotencyKey, r.provider AS provider,
  r.method AS method, r.card_mode AS cardMode, r.provider_charge_id AS providerChargeId,
  r.amount_cents AS amountCents, r.service_fee_cents AS serviceFeeCents, r.origin AS origin,
  r.state AS state, r.attempts AS attempts, r.next_attempt_at AS nextAttemptAt,
  r.attempt_started_at AS attemptStartedAt, r.checked_at AS checkedAt,
  r.last_error_code AS lastErrorCode, r.provider_refund_id AS providerRefundId,
  r.requested_at AS requestedAt, r.succeeded_at AS succeededAt, r.created_at AS createdAt,
  r.updated_at AS updatedAt
  FROM refunds r`;

const ACTIVE_STATUSES_SQL = `('received', 'preparing', 'ready_for_pickup', 'out_for_delivery')`;
const PAID_OUT_SQL = `EXISTS (SELECT 1 FROM ledger_entry_payouts p WHERE p.ledger_entry_id = e.id)`;

function changed(result: D1Result | undefined): boolean {
  return (result?.meta.changes ?? 0) > 0;
}

function shortCode(code: string): string {
  const value = code.replace(/\s+/gu, " ").trim().slice(0, 80);
  return value || "unknown";
}

/**
 * Obrigação de Estorno + reversão do Ledger para as cobranças PAGAS que casam com `where`
 * (sobre `payment_intents i JOIN orders o`). `ON CONFLICT DO NOTHING`: uma por intenção e uma
 * reversão por lançamento, sempre — repetir não cria nada.
 */
function refundStatements(
  d1: D1Database,
  input: {
    refundId: string;
    origin: RefundOriginValue;
    now: string;
    /** 1º dia útil depois de `now` (São Paulo): lote do débito compensado. */
    compensationPayoutDate: string;
    where: string;
    binds: unknown[];
  },
): D1PreparedStatement[] {
  return [
    d1
      .prepare(
        `INSERT INTO refunds (id, store_id, order_id, intent_id, idempotency_key, provider, method,
           card_mode, provider_charge_id, amount_cents, service_fee_cents, origin, state, attempts,
           created_at, updated_at)
         SELECT ?, i.store_id, i.order_id, i.id, 'refund:' || i.id, i.provider, i.method,
           i.card_mode, i.provider_charge_id, i.amount_cents, i.service_fee_cents, ?, 'pending', 0,
           ?, ?
         FROM payment_intents i JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id
         WHERE ${input.where} AND i.state = 'paid' AND i.provider_charge_id IS NOT NULL
         ON CONFLICT DO NOTHING`,
      )
      .bind(input.refundId, input.origin, input.now, input.now, ...input.binds),
    d1
      .prepare(
        `INSERT INTO ledger_reversals (id, store_id, order_id, ledger_entry_id, refund_id, kind,
           charged_cents, order_total_cents, service_fee_cents, foode_fee_cents, net_cents,
           expected_payout_date, occurred_at, created_at)
         SELECT ?, e.store_id, e.order_id, e.id, r.id,
           CASE WHEN ${PAID_OUT_SQL} THEN 'compensated_debit' ELSE 'annulment' END,
           e.charged_cents, e.order_total_cents, e.service_fee_cents, e.foode_fee_cents,
           e.net_cents, CASE WHEN ${PAID_OUT_SQL} THEN ? ELSE e.expected_payout_date END, ?, ?
         FROM refunds r JOIN ledger_entries e ON e.intent_id = r.intent_id AND e.kind = 'payment'
           AND e.store_id = r.store_id
         WHERE r.id = ?
         ON CONFLICT DO NOTHING`,
      )
      .bind(newId(), input.compensationPayoutDate, input.now, input.now, input.refundId),
  ];
}

/**
 * Pagamento confirmado de Pedido JÁ cancelado: Estorno total (`late_payment`) + reversão, no MESMO
 * batch da confirmação (depois do INSERT do lançamento). Nada acontece se o Pedido não está
 * cancelado ou se a intenção não ficou paga nesta confirmação (`paid_at`).
 */
export function lateRefundStatements(
  d1: D1Database,
  input: { intentId: string; paidAt: string; now: string; compensationPayoutDate: string },
): D1PreparedStatement[] {
  return refundStatements(d1, {
    refundId: newId(),
    origin: "late_payment",
    now: input.now,
    compensationPayoutDate: input.compensationPayoutDate,
    where: `i.id = ? AND i.paid_at = ? AND o.status = 'cancelled'`,
    binds: [input.intentId, input.paidAt],
  });
}

export type CancelOrderDbInput = {
  orderId: string;
  /** Estado que o Painel exibia (null = qualquer estado ativo). */
  from: OrderStatus | null;
  reason: Exclude<OrderCancelReasonValue, "pix_expired"> | null;
  /** 1º dia útil depois de agora (São Paulo), calculado pela api (@foode/shared/payment). */
  compensationPayoutDate: string;
};

export type CancelOrderDbData = {
  fulfillment: OrderFulfillment;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  totalCents: number;
  serviceFeeCents: number;
  cancelledAt: string;
  /** Obrigação de Estorno criada neste cancelamento (null = nada pago). */
  refund: RefundView | null;
};

/** Cancela um Pedido da Loja do contexto com a obrigação de Estorno no mesmo batch. */
export async function cancelOrderWithRefund(
  d1: D1Database,
  context: StoreContext,
  input: CancelOrderDbInput,
): Promise<OperationResult<CancelOrderDbData>> {
  assertIssued(context);
  const storeId = context.storeId;
  const now = utcNow();
  const refundId = newId();
  const guard = `o.id = ? AND o.store_id = ? AND o.${PAINEL_VISIBLE_PAYMENT_SQL}
    AND o.status IN ${ACTIVE_STATUSES_SQL} AND (? IS NULL OR o.status = ?)`;
  const guardBinds = [input.orderId, storeId, input.from, input.from];
  const results = await d1.batch([
    // Histórico com o estado anterior (lido antes do UPDATE, mesma condição, mesma transação).
    d1
      .prepare(
        `INSERT INTO order_status_events (id, store_id, order_id, from_status, to_status,
           actor_user_id, actor_role, occurred_at)
         SELECT ?, o.store_id, o.id, o.status, 'cancelled', ?, ?, ? FROM orders o WHERE ${guard}`,
      )
      .bind(newId(), context.userId, context.role, now, ...guardBinds),
    d1
      .prepare(
        `INSERT INTO order_cancellations (order_id, store_id, reason, actor_user_id, actor_role,
           cancelled_at, created_at)
         SELECT o.id, o.store_id, ?, ?, ?, ?, ? FROM orders o WHERE ${guard}
         ON CONFLICT DO NOTHING`,
      )
      .bind(input.reason, context.userId, context.role, now, now, ...guardBinds),
    d1
      .prepare(
        `UPDATE orders AS o SET status = 'cancelled', updated_at = ?
         WHERE ${guard} AND EXISTS (SELECT 1 FROM order_cancellations c
           WHERE c.order_id = o.id AND c.store_id = o.store_id AND c.cancelled_at = ?)`,
      )
      .bind(now, ...guardBinds, now),
    ...refundStatements(d1, {
      refundId,
      origin: "order_cancelled",
      now,
      compensationPayoutDate: input.compensationPayoutDate,
      where: `o.id = ? AND o.store_id = ? AND o.status = 'cancelled' AND EXISTS (
        SELECT 1 FROM order_cancellations c WHERE c.order_id = o.id AND c.store_id = o.store_id
          AND c.cancelled_at = ?)`,
      binds: [input.orderId, storeId, now],
    }),
    d1
      .prepare(
        `SELECT o.status AS status, o.fulfillment AS fulfillment,
           o.payment_method AS paymentMethod, o.payment_status AS paymentStatus,
           o.total_cents AS totalCents, o.service_fee_cents AS serviceFeeCents,
           (SELECT c.cancelled_at FROM order_cancellations c
             WHERE c.order_id = o.id AND c.store_id = o.store_id) AS cancelledAt
         FROM orders o WHERE o.id = ? AND o.store_id = ? AND o.${PAINEL_VISIBLE_PAYMENT_SQL}`,
      )
      .bind(input.orderId, storeId),
    d1.prepare(`${REFUND_SELECT} WHERE r.id = ? AND r.store_id = ?`).bind(refundId, storeId),
  ]);
  type Row = {
    status: OrderStatus;
    fulfillment: OrderFulfillment;
    paymentMethod: OrderPaymentMethod;
    paymentStatus: OrderPaymentStatus;
    totalCents: number;
    serviceFeeCents: number;
    cancelledAt: string | null;
  };
  const row = (results[results.length - 2]?.results as Row[] | undefined)?.[0];
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "cancelled" || row.cancelledAt !== now) {
    return { ok: false, error: "conflict" };
  }
  const refund = (results[results.length - 1]?.results as RefundView[] | undefined)?.[0] ?? null;
  return {
    ok: true,
    data: {
      fulfillment: row.fulfillment,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      totalCents: row.totalCents,
      serviceFeeCents: row.serviceFeeCents,
      cancelledAt: now,
      refund,
    },
  };
}

/** PIX vencido/sem cobrança cujo Pedido ainda não foi cancelado (varredura do Cron). */
export type ExpirablePix = {
  intentId: string;
  storeId: string;
  orderId: string;
  state: "creating" | "pending" | "expired" | "failed";
  providerChargeId: string | null;
  expiresAt: string | null;
};

export type RefundConfirmOutcome = "applied" | "already_applied" | "unmatched" | "duplicate";

export function createRefundOps(d1: D1Database) {
  async function refundWhere(where: string, ...binds: unknown[]): Promise<RefundView | null> {
    return (
      (await d1
        .prepare(`${REFUND_SELECT} WHERE ${where}`)
        .bind(...binds)
        .first<RefundView>()) ?? null
    );
  }

  async function refundsWhere(where: string, ...binds: unknown[]): Promise<RefundView[]> {
    const { results } = await d1
      .prepare(`${REFUND_SELECT} WHERE ${where}`)
      .bind(...binds)
      .all<RefundView>();
    return results;
  }

  return {
    byId(refundId: string): Promise<RefundView | null> {
      return refundWhere(`r.id = ?`, refundId);
    },

    ofIntent(intentId: string): Promise<RefundView | null> {
      return refundWhere(`r.intent_id = ?`, intentId);
    },

    /** Estornos do Pedido, mais recente primeiro (conferência e testes). */
    ofOrder(orderId: string): Promise<RefundView[]> {
      return refundsWhere(`r.order_id = ? ORDER BY r.created_at DESC, r.rowid DESC`, orderId);
    },

    /** Prontos para (nova) tentativa: pendentes/falhos, fora do backoff e sem lease vivo. */
    dueForAttempt(now: string, staleBefore: string, limit: number): Promise<RefundView[]> {
      return refundsWhere(
        `r.state IN ('pending', 'failed') AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= ?)
           AND (r.attempt_started_at IS NULL OR r.attempt_started_at < ?)
         ORDER BY r.created_at LIMIT ?`,
        now,
        staleBefore,
        limit,
      );
    },

    /** Aceitos pelo provedor e ainda sem confirmação: consulta autenticada (sem webhook). */
    dueForCheck(checkedBefore: string, limit: number): Promise<RefundView[]> {
      return refundsWhere(
        `r.state = 'requested' AND COALESCE(r.checked_at, r.requested_at) <= ?
         ORDER BY r.requested_at LIMIT ?`,
        checkedBefore,
        limit,
      );
    },

    /**
     * Reserva a chamada ao provedor (lease): só uma por vez, só fora do backoff. Conta a
     * tentativa. Lease vencido (`staleBefore`) libera de novo: o Estorno é idempotente no
     * provedor (total; "já estornado" = sucesso).
     */
    async claim(refundId: string, now: string, staleBefore: string): Promise<boolean> {
      const result = await d1
        .prepare(
          `UPDATE refunds SET attempt_started_at = ?, attempts = attempts + 1, updated_at = ?
           WHERE id = ? AND state IN ('pending', 'failed')
             AND (attempt_started_at IS NULL OR attempt_started_at < ?)
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        )
        .bind(now, now, refundId, staleBefore, now)
        .run();
      return changed(result);
    },

    /** Provedor aceitou; a confirmação chega pelo webhook/consulta (pending/failed → requested). */
    async markRequested(refundId: string, providerRefundId: string | null): Promise<boolean> {
      const now = utcNow();
      const result = await d1
        .prepare(
          `UPDATE refunds SET state = 'requested', requested_at = COALESCE(requested_at, ?),
             provider_refund_id = COALESCE(?, provider_refund_id), attempt_started_at = NULL,
             next_attempt_at = NULL, last_error_code = NULL, updated_at = ?
           WHERE id = ? AND state IN ('pending', 'failed')`,
        )
        .bind(now, providerRefundId?.slice(0, 200) || null, now, refundId)
        .run();
      return changed(result);
    },

    /** Estorno concluído (resposta síncrona ou consulta). Nunca regride. */
    async markSucceeded(
      refundId: string,
      providerRefundId: string | null = null,
    ): Promise<boolean> {
      const now = utcNow();
      const result = await d1
        .prepare(
          `UPDATE refunds SET state = 'succeeded', succeeded_at = ?,
             requested_at = COALESCE(requested_at, ?),
             provider_refund_id = COALESCE(?, provider_refund_id), attempt_started_at = NULL,
             next_attempt_at = NULL, last_error_code = NULL, updated_at = ?
           WHERE id = ? AND state <> 'succeeded'`,
        )
        .bind(now, now, providerRefundId?.slice(0, 200) || null, now, refundId)
        .run();
      return changed(result);
    },

    /** Falha (retentável): código curto, próxima tentativa; o Pedido continua cancelado. */
    async markFailed(refundId: string, code: string, nextAttemptAt: string): Promise<boolean> {
      const now = utcNow();
      const result = await d1
        .prepare(
          `UPDATE refunds SET state = 'failed', last_error_code = ?, next_attempt_at = ?,
             attempt_started_at = NULL, updated_at = ?
           WHERE id = ? AND state IN ('pending', 'failed')`,
        )
        .bind(shortCode(code), nextAttemptAt, now, refundId)
        .run();
      return changed(result);
    },

    async markChecked(refundId: string, now: string): Promise<void> {
      await d1
        .prepare(`UPDATE refunds SET checked_at = ?, updated_at = ? WHERE id = ?`)
        .bind(now, now, refundId)
        .run();
    },

    /**
     * Webhook de Estorno concluído (AbacatePay `transparent.refunded`, Efí `refunded`): evento de
     * identidade única + Estorno `succeeded` no mesmo batch. Repetido = `duplicate`; Estorno que
     * não nasceu de um cancelamento = `unmatched` (registrado para conferência).
     */
    async confirmByProviderCharge(input: {
      providerChargeId: string;
      event: WebhookEventInput;
    }): Promise<RefundConfirmOutcome> {
      const now = utcNow();
      const eventRowId = newId();
      const provider = input.event.provider;
      const [, , outcome] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO payment_webhook_events (id, provider, event_id, event_type,
               provider_charge_id, intent_id, outcome, dev_mode, received_at)
             SELECT ?, ?, ?, ?, ?,
               (SELECT intent_id FROM refunds WHERE provider = ? AND provider_charge_id = ?),
               CASE
                 WHEN EXISTS (SELECT 1 FROM refunds WHERE provider = ? AND provider_charge_id = ?
                   AND state <> 'succeeded') THEN 'applied'
                 WHEN EXISTS (SELECT 1 FROM refunds WHERE provider = ? AND provider_charge_id = ?)
                   THEN 'already_applied'
                 ELSE 'unmatched' END,
               ?, ?
             WHERE 1
             ON CONFLICT(provider, event_id) DO NOTHING`,
          )
          .bind(
            eventRowId,
            provider,
            input.event.eventId,
            input.event.eventType.slice(0, 80),
            input.providerChargeId,
            provider,
            input.providerChargeId,
            provider,
            input.providerChargeId,
            provider,
            input.providerChargeId,
            input.event.devMode ? 1 : 0,
            now,
          ),
        d1
          .prepare(
            `UPDATE refunds SET state = 'succeeded', succeeded_at = ?,
               requested_at = COALESCE(requested_at, ?), attempt_started_at = NULL,
               next_attempt_at = NULL, last_error_code = NULL, updated_at = ?
             WHERE provider = ? AND provider_charge_id = ? AND state <> 'succeeded'
               AND EXISTS (SELECT 1 FROM payment_webhook_events WHERE id = ?)`,
          )
          .bind(now, now, now, provider, input.providerChargeId, eventRowId),
        d1.prepare(`SELECT outcome FROM payment_webhook_events WHERE id = ?`).bind(eventRowId),
      ]);
      const row = (outcome?.results as { outcome: RefundConfirmOutcome }[] | undefined)?.[0];
      return row?.outcome ?? "duplicate";
    },

    /**
     * Cartão aprovado DEPOIS de recusado quando o Pedido já trocou de meio, já tem outra
     * tentativa paga ou foi cancelado (a confirmação foi recusada): o dinheiro entrou sem
     * Pedido a pagar. Obrigação de Estorno total (`orphan_charge`), sem Ledger.
     */
    async refundOrphanCardCharge(input: {
      intentId: string;
      providerChargeId: string;
    }): Promise<RefundView | null> {
      const now = utcNow();
      await d1
        .prepare(
          `INSERT INTO refunds (id, store_id, order_id, intent_id, idempotency_key, provider,
             method, card_mode, provider_charge_id, amount_cents, service_fee_cents, origin, state,
             attempts, created_at, updated_at)
           SELECT ?, i.store_id, i.order_id, i.id, 'refund:' || i.id, i.provider, i.method,
             i.card_mode, ?, i.amount_cents, i.service_fee_cents, 'orphan_charge', 'pending', 0,
             ?, ?
           FROM payment_intents i JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id
           WHERE i.id = ? AND i.method = 'credit' AND i.state = 'failed'
             AND (i.provider_charge_id IS NULL OR i.provider_charge_id = ?)
             AND (o.payment_method <> 'credit' OR o.status = 'cancelled' OR EXISTS (
               SELECT 1 FROM payment_intents x WHERE x.store_id = i.store_id
                 AND x.order_id = i.order_id AND x.id <> i.id AND x.state = 'paid'))
           ON CONFLICT DO NOTHING`,
        )
        .bind(newId(), input.providerChargeId, now, now, input.intentId, input.providerChargeId)
        .run();
      return refundWhere(`r.intent_id = ?`, input.intentId);
    },

    /**
     * PIX sem pagamento cujo Pedido segue ativo: QR vencido (`expires_at <= now`), cobrança que
     * nunca saiu (`creating` antes de `creatingBefore`), ou já `expired`/`failed`.
     */
    async expirablePix(
      now: string,
      creatingBefore: string,
      limit: number,
    ): Promise<ExpirablePix[]> {
      const { results } = await d1
        .prepare(
          `SELECT i.id AS intentId, i.store_id AS storeId, i.order_id AS orderId, i.state AS state,
             i.provider_charge_id AS providerChargeId, i.expires_at AS expiresAt
           FROM payment_intents i JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id
           WHERE i.method = 'pix' AND o.payment_method = 'pix'
             AND o.status IN ${ACTIVE_STATUSES_SQL}
             AND o.payment_status IN ('awaiting', 'expired', 'failed')
             AND (i.state IN ('expired', 'failed')
               OR (i.state = 'pending' AND i.expires_at IS NOT NULL AND i.expires_at <= ?)
               OR (i.state = 'creating' AND i.created_at <= ?))
           ORDER BY i.created_at LIMIT ?`,
        )
        .bind(now, creatingBefore, limit)
        .all<ExpirablePix>();
      return results;
    },

    /**
     * Cancela o Pedido do PIX não pago (motivo de sistema `pix_expired`, sem autor) num único
     * batch: intenção `expired`, histórico, motivo, Pedido `cancelled` (sai da faixa de Pedidos),
     * Cupom liberado (uso desfeito + auditoria `coupon.released`). Idempotente: só a partir de
     * Pedido ativo e sem pagamento; repetir não muda nada. Pagamento tardio converge para Estorno
     * pela confirmação (`lateRefundStatements`).
     */
    async cancelExpiredPix(target: {
      intentId: string;
      orderId: string;
      storeId: string;
    }): Promise<boolean> {
      const now = utcNow();
      const guard = `o.id = ? AND o.store_id = ? AND o.payment_method = 'pix'
        AND o.status IN ${ACTIVE_STATUSES_SQL}
        AND o.payment_status IN ('awaiting', 'expired', 'failed')
        AND EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = ? AND i.store_id = o.store_id
          AND i.order_id = o.id AND i.method = 'pix' AND i.state IN ('expired', 'failed'))`;
      const guardBinds = [target.orderId, target.storeId, target.intentId];
      const cancelledNow = `EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id = ?
        AND c.store_id = ? AND c.cancelled_at = ? AND c.reason = 'pix_expired')`;
      const cancelledBinds = [target.orderId, target.storeId, now];
      const [, , , update] = await d1.batch([
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'expired', updated_at = ?
             WHERE id = ? AND store_id = ? AND order_id = ? AND method = 'pix'
               AND state IN ('creating', 'pending')`,
          )
          .bind(now, target.intentId, target.storeId, target.orderId),
        d1
          .prepare(
            `INSERT INTO order_status_events (id, store_id, order_id, from_status, to_status,
               actor_user_id, actor_role, occurred_at)
             SELECT ?, o.store_id, o.id, o.status, 'cancelled', NULL, NULL, ? FROM orders o
             WHERE ${guard}`,
          )
          .bind(newId(), now, ...guardBinds),
        d1
          .prepare(
            `INSERT INTO order_cancellations (order_id, store_id, reason, actor_user_id,
               actor_role, cancelled_at, created_at)
             SELECT o.id, o.store_id, 'pix_expired', NULL, NULL, ?, ? FROM orders o
             WHERE ${guard}
             ON CONFLICT DO NOTHING`,
          )
          .bind(now, now, ...guardBinds),
        d1
          .prepare(
            `UPDATE orders AS o SET status = 'cancelled',
               payment_status = CASE WHEN payment_status = 'awaiting' THEN 'expired'
                 ELSE payment_status END,
               updated_at = ?
             WHERE ${guard} AND ${cancelledNow}`,
          )
          .bind(now, ...guardBinds, ...cancelledBinds),
        // Cupom: desfaz o uso (o limite volta a ter vaga) e o boas-vindas volta a valer.
        d1
          .prepare(
            `UPDATE coupons SET used_count = used_count - 1
             WHERE used_count > 0 AND store_id = ? AND id IN (
               SELECT coupon_id FROM coupon_redemptions WHERE store_id = ? AND order_id = ?
                 AND source = 'promo')
               AND ${cancelledNow}`,
          )
          .bind(target.storeId, target.storeId, target.orderId, ...cancelledBinds),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action,
               target_type, target_id, metadata)
             SELECT ?, ?, NULL, store_id, 'coupon.released', 'order', order_id,
               json_object('source', source, 'couponId', coupon_id, 'reason', 'pix_expired')
             FROM coupon_redemptions WHERE store_id = ? AND order_id = ? AND ${cancelledNow}`,
          )
          .bind(newId(), now, target.storeId, target.orderId, ...cancelledBinds),
        d1
          .prepare(
            `DELETE FROM coupon_redemptions WHERE store_id = ? AND order_id = ?
               AND ${cancelledNow}`,
          )
          .bind(target.storeId, target.orderId, ...cancelledBinds),
      ]);
      return changed(update);
    },

    /** Motivo e instante do cancelamento (conferência e testes). */
    async cancellationOf(orderId: string) {
      return d1
        .prepare(
          `SELECT reason, actor_user_id AS actorUserId, actor_role AS actorRole,
             cancelled_at AS cancelledAt FROM order_cancellations WHERE order_id = ?`,
        )
        .bind(orderId)
        .first<{
          reason: OrderCancelReasonValue | null;
          actorUserId: string | null;
          actorRole: "owner" | "operator" | null;
          cancelledAt: string;
        }>();
    },

    /** Reversões do Ledger do Pedido (conferência e testes). */
    async reversalsOfOrder(orderId: string) {
      const { results } = await d1
        .prepare(
          `SELECT kind, charged_cents AS chargedCents, service_fee_cents AS serviceFeeCents,
             foode_fee_cents AS foodeFeeCents, net_cents AS netCents,
             expected_payout_date AS expectedPayoutDate, ledger_entry_id AS ledgerEntryId
           FROM ledger_reversals WHERE order_id = ? ORDER BY rowid`,
        )
        .bind(orderId)
        .all<{
          kind: "annulment" | "compensated_debit";
          chargedCents: number;
          serviceFeeCents: number;
          foodeFeeCents: number;
          netCents: number;
          expectedPayoutDate: string;
          ledgerEntryId: string;
        }>();
      return results;
    },
  };
}

export type RefundOps = ReturnType<typeof createRefundOps>;
