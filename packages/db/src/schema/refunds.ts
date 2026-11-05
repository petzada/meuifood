// Cancelamento com Estorno automático (Ticket 12, migration 0010; decisões 39, 60, 63 P-OPE-3 e
// 71). Só expand: quatro tabelas novas; nada em tabela existente muda.
//
// - `order_cancellations` (1:1 com o Pedido cancelado): motivo opcional (P-OPE-3; `pix_expired`
//   quando o sistema cancela o PIX vencido), quem e papel (null = sistema) e quando. Gravada no
//   MESMO batch que muda `orders.status` para `cancelled`.
// - `refunds`: a OBRIGAÇÃO de Estorno, gravada no MESMO batch do cancelamento (ou da confirmação
//   tardia de um Pedido já cancelado) e ANTES de qualquer chamada ao provedor. Uma por cobrança
//   paga (UNIQUE `intent_id`), com chave idempotente estável (`refund:<intentId>`). Provedor,
//   meio e cobrança COPIADOS da intenção gravada (nunca do request). Sempre total: `amount_cents`
//   = o que o Consumidor pagou, inclusive a tarifa de serviço (decisão 71). Estado só avança:
//   pending → requested (provedor aceitou) → succeeded; falha = `failed` com `next_attempt_at`
//   (retentativa automática; nunca desiste). `last_error_code` é um código curto do provedor, sem
//   corpo nem dado pessoal.
// - `ledger_reversals`: fato do Estorno no Ledger, sem apagar nem editar o lançamento original.
//   Uma por lançamento (UNIQUE `ledger_entry_id`): `annulment` (ainda não repassado: anulado no
//   mesmo repasse previsto) ou `compensated_debit` (já repassado: débito nos lotes seguintes).
//   Mesmos CHECKs de soma do lançamento.
// - `ledger_entry_payouts` (1:1 com o lançamento): o lançamento foi repassado ao lojista. Quem
//   grava é o lote pago do Ticket 14; aqui decide a reversão (existe = débito compensado).
// FKs compostas (store_id, order_id) → orders (store_id, id): nada aponta para outra Loja.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";
import { MENU_MAX_CENTS } from "./menu";
import { CARD_MODES, FEE_PAYMENT_METHODS, PAYMENT_PROVIDERS } from "./ops";
import { orders } from "./orders";
import { ledgerEntries, paymentIntents } from "./payments";
import { PAUSE_ROLES } from "./store-operation";

/** = `REFUND_RECORD_STATES` de @foode/shared/payment. */
export const REFUND_STATES = ["pending", "requested", "succeeded", "failed"] as const;
export type RefundStateValue = (typeof REFUND_STATES)[number];

/** = `REFUND_ORIGINS` de @foode/shared/payment. */
export const REFUND_ORIGINS = ["order_cancelled", "late_payment", "orphan_charge"] as const;
export type RefundOriginValue = (typeof REFUND_ORIGINS)[number];

/** = `LEDGER_REVERSAL_KINDS` de @foode/shared/payment. */
export const LEDGER_REVERSAL_KINDS = ["annulment", "compensated_debit"] as const;
export type LedgerReversalKindValue = (typeof LEDGER_REVERSAL_KINDS)[number];

/**
 * Motivo do cancelamento (= `ORDER_CANCEL_REASONS` de @foode/shared/order): os quatro do Painel
 * (P-OPE-3) e `pix_expired` (sistema).
 */
export const ORDER_CANCEL_REASONS = [
  "item_unavailable",
  "no_courier",
  "customer_request",
  "other",
  "pix_expired",
] as const;
export type OrderCancelReasonValue = (typeof ORDER_CANCEL_REASONS)[number];

function nullableUtc(column: string) {
  return sql.raw(
    `"${column}" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "${column}") IS "${column}"`,
  );
}

function centsCheck(column: string, min = 0) {
  return sql.raw(`"${column}" BETWEEN ${min} AND ${MENU_MAX_CENTS}`);
}

export const orderCancellations = sqliteTable(
  "order_cancellations",
  {
    orderId: text("order_id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** null = cancelado sem motivo (P-OPE-3). */
    reason: text("reason", { enum: ORDER_CANCEL_REASONS }),
    /** null = sistema (PIX vencido). */
    actorUserId: text("actor_user_id").references(() => users.id),
    actorRole: text("actor_role", { enum: PAUSE_ROLES }),
    cancelledAt: text("cancelled_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "order_cancellations_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    index("order_cancellations_store_idx").on(table.storeId, table.cancelledAt),
    check(
      "order_cancellations_reason",
      sql.raw(`"reason" IS NULL OR ${inList("reason", ORDER_CANCEL_REASONS)}`),
    ),
    check(
      "order_cancellations_actor",
      sql.raw(
        `("actor_user_id" IS NULL AND "actor_role" IS NULL) OR ("actor_user_id" IS NOT NULL AND ${inList("actor_role", PAUSE_ROLES)})`,
      ),
    ),
    check(
      "order_cancellations_system_reason",
      sql.raw(`"reason" IS NOT 'pix_expired' OR "actor_user_id" IS NULL`),
    ),
    check("order_cancellations_cancelled_at_utc", utcCheck("cancelled_at")),
    check("order_cancellations_created_at_utc", utcCheck("created_at")),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    intentId: text("intent_id")
      .notNull()
      .references(() => paymentIntents.id),
    /** `refund:<intentId>`: estável entre tentativas (mesma obrigação, mesmo Estorno). */
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    method: text("method", { enum: FEE_PAYMENT_METHODS }).notNull(),
    cardMode: text("card_mode", { enum: CARD_MODES }),
    /** Cobrança a estornar no provedor (copiada da intenção/confirmação). */
    providerChargeId: text("provider_charge_id").notNull(),
    /** Estorno total: Pedido + tarifa de serviço. */
    amountCents: integer("amount_cents").notNull(),
    serviceFeeCents: integer("service_fee_cents").notNull(),
    origin: text("origin", { enum: REFUND_ORIGINS }).notNull(),
    state: text("state", { enum: REFUND_STATES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Próxima tentativa (backoff); null = já pode tentar. */
    nextAttemptAt: text("next_attempt_at"),
    /** Lease da chamada ao provedor (uma por vez). */
    attemptStartedAt: text("attempt_started_at"),
    /** Última consulta autenticada do Estorno `requested` (reconciliação sem webhook). */
    checkedAt: text("checked_at"),
    /** Código curto do último erro do provedor, sem corpo nem dado pessoal. */
    lastErrorCode: text("last_error_code"),
    providerRefundId: text("provider_refund_id"),
    requestedAt: text("requested_at"),
    succeededAt: text("succeeded_at"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "refunds_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("refunds_intent_unique").on(table.intentId),
    uniqueIndex("refunds_idempotency_unique").on(table.idempotencyKey),
    index("refunds_store_order_idx").on(table.storeId, table.orderId),
    index("refunds_state_next_idx").on(table.state, table.nextAttemptAt),
    index("refunds_provider_charge_idx").on(table.provider, table.providerChargeId),
    check("refunds_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check("refunds_method", sql.raw(inList("method", FEE_PAYMENT_METHODS))),
    check(
      "refunds_card_mode",
      sql.raw(`"card_mode" IS NULL OR ${inList("card_mode", CARD_MODES)}`),
    ),
    check("refunds_origin", sql.raw(inList("origin", REFUND_ORIGINS))),
    check("refunds_state", sql.raw(inList("state", REFUND_STATES))),
    check("refunds_idempotency_key", sql.raw(`length("idempotency_key") BETWEEN 1 AND 80`)),
    check("refunds_provider_charge_id", sql.raw(`length("provider_charge_id") BETWEEN 1 AND 200`)),
    check("refunds_amount_cents", centsCheck("amount_cents", 1)),
    check("refunds_service_fee_cents", centsCheck("service_fee_cents")),
    check("refunds_service_fee_lt_amount", sql.raw(`"service_fee_cents" < "amount_cents"`)),
    check("refunds_attempts", sql.raw(`"attempts" >= 0`)),
    check(
      "refunds_last_error_code",
      sql.raw(`"last_error_code" IS NULL OR length("last_error_code") BETWEEN 1 AND 80`),
    ),
    check(
      "refunds_provider_refund_id",
      sql.raw(`"provider_refund_id" IS NULL OR length("provider_refund_id") BETWEEN 1 AND 200`),
    ),
    check(
      "refunds_succeeded_at",
      sql.raw(`("state" = 'succeeded') = ("succeeded_at" IS NOT NULL)`),
    ),
    check("refunds_next_attempt_at_utc", nullableUtc("next_attempt_at")),
    check("refunds_attempt_started_at_utc", nullableUtc("attempt_started_at")),
    check("refunds_checked_at_utc", nullableUtc("checked_at")),
    check("refunds_requested_at_utc", nullableUtc("requested_at")),
    check("refunds_succeeded_at_utc", nullableUtc("succeeded_at")),
    check("refunds_created_at_utc", utcCheck("created_at")),
    check("refunds_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const ledgerReversals = sqliteTable(
  "ledger_reversals",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntries.id),
    refundId: text("refund_id")
      .notNull()
      .references(() => refunds.id),
    kind: text("kind", { enum: LEDGER_REVERSAL_KINDS }).notNull(),
    /** Devolvido ao Consumidor (= `charged_cents` do lançamento). */
    chargedCents: integer("charged_cents").notNull(),
    orderTotalCents: integer("order_total_cents").notNull(),
    /** Tarifa de serviço devolvida (sai da receita da Foode). */
    serviceFeeCents: integer("service_fee_cents").notNull(),
    foodeFeeCents: integer("foode_fee_cents").notNull(),
    /** Líquido do lojista anulado (annulment) ou debitado (compensated_debit). */
    netCents: integer("net_cents").notNull(),
    /** Repasse em que conta: o do lançamento (anulação) ou o próximo dia útil (débito). */
    expectedPayoutDate: text("expected_payout_date").notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "ledger_reversals_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("ledger_reversals_entry_unique").on(table.ledgerEntryId),
    index("ledger_reversals_store_payout_idx").on(table.storeId, table.expectedPayoutDate),
    check("ledger_reversals_kind", sql.raw(inList("kind", LEDGER_REVERSAL_KINDS))),
    check("ledger_reversals_charged_cents", centsCheck("charged_cents", 1)),
    check("ledger_reversals_order_total_cents", centsCheck("order_total_cents")),
    check("ledger_reversals_service_fee_cents", centsCheck("service_fee_cents")),
    check("ledger_reversals_foode_fee_cents", centsCheck("foode_fee_cents")),
    check(
      "ledger_reversals_sums",
      sql.raw(
        `"charged_cents" = "order_total_cents" + "service_fee_cents" AND "foode_fee_cents" <= "order_total_cents" AND "net_cents" = "order_total_cents" - "foode_fee_cents"`,
      ),
    ),
    check(
      "ledger_reversals_expected_payout_date",
      sql.raw(`strftime('%Y-%m-%d', "expected_payout_date") IS "expected_payout_date"`),
    ),
    check("ledger_reversals_occurred_at_utc", utcCheck("occurred_at")),
    check("ledger_reversals_created_at_utc", utcCheck("created_at")),
  ],
);

export const ledgerEntryPayouts = sqliteTable(
  "ledger_entry_payouts",
  {
    ledgerEntryId: text("ledger_entry_id")
      .primaryKey()
      .references(() => ledgerEntries.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    paidOutAt: text("paid_out_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    index("ledger_entry_payouts_store_idx").on(table.storeId, table.paidOutAt),
    check("ledger_entry_payouts_paid_out_at_utc", utcCheck("paid_out_at")),
    check("ledger_entry_payouts_created_at_utc", utcCheck("created_at")),
  ],
);

export type OrderCancellationRow = typeof orderCancellations.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;
export type LedgerReversalRow = typeof ledgerReversals.$inferSelect;
export type LedgerEntryPayoutRow = typeof ledgerEntryPayouts.$inferSelect;
