// Pagamento online e Ledger (Ticket 26, migration 0007; decisões 60, 61 e 71; ADR 0007). Só
// expand: tabelas novas + colunas novas em `orders` (orders.ts). Convenções de fundacao.ts.
//
// - `payment_intents`: a intenção de cobrança, gravada NA MESMA escrita do Pedido e ANTES da
//   chamada ao provedor. O `id` é a nossa chave de idempotência (vai em `metadata.intentId` da
//   AbacatePay, que não tem Idempotency-Key). Guarda o snapshot do que vale para o dinheiro:
//   provedor, meio, modo, custódia (`pilot_platform`), valor cobrado, tarifa de serviço e a taxa
//   Foode vigente (id, % e fixo). Uma intenção PIX por Pedido (UNIQUE parcial). O estado só
//   avança (creating → pending → paid; expired/failed; expired → paid quando o dinheiro chega
//   depois): as escritas de @foode/db são UPDATEs condicionais no estado anterior.
// - `payment_webhook_events`: identidade única do evento do provedor (UNIQUE provider+event_id):
//   reentrega e duplicata não têm efeito duplo. Sem corpo, sem dado do pagador.
// - `ledger_entries`: lançamento único por intenção paga (UNIQUE parcial em `intent_id` para
//   `kind = 'payment'`), com total, tarifa de serviço (receita da Foode), taxa Foode, custo do
//   provedor, líquido do lojista, data de liberação e repasse previsto (D+1 útil). O CHECK
//   garante `net = total do Pedido − taxa Foode` e `charged = total + tarifa`.
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

import { inList, stores, utcCheck, utcNowDefault } from "./fundacao";
import { MENU_MAX_CENTS } from "./menu";
import { CARD_MODES, FEE_PAYMENT_METHODS, PAYMENT_PROVIDERS, paymentFees } from "./ops";
import { orders } from "./orders";

export const PAYMENT_INTENT_STATES = ["creating", "pending", "paid", "expired", "failed"] as const;
export type PaymentIntentState = (typeof PAYMENT_INTENT_STATES)[number];

export const PAYMENT_CUSTODY_MODES = ["pilot_platform"] as const;

export const WEBHOOK_EVENT_OUTCOMES = [
  "applied",
  "already_applied",
  "ignored",
  "unmatched",
  "amount_mismatch",
  "deferred",
] as const;
export type WebhookEventOutcome = (typeof WEBHOOK_EVENT_OUTCOMES)[number];

export const LEDGER_ENTRY_KINDS = ["payment"] as const;

function nullableUtc(column: string) {
  return sql.raw(
    `"${column}" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "${column}") IS "${column}"`,
  );
}

function civilDateCheck(column: string) {
  return sql.raw(`strftime('%Y-%m-%d', "${column}") IS "${column}"`);
}

function centsCheck(column: string, min = 0) {
  return sql.raw(`"${column}" BETWEEN ${min} AND ${MENU_MAX_CENTS}`);
}

export const paymentIntents = sqliteTable(
  "payment_intents",
  {
    /** Nossa chave de idempotência (UUID), enviada como `metadata.intentId`. */
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    method: text("method", { enum: FEE_PAYMENT_METHODS }).notNull(),
    cardMode: text("card_mode", { enum: CARD_MODES }),
    custody: text("custody", { enum: PAYMENT_CUSTODY_MODES }).notNull().default("pilot_platform"),
    /** Valor cobrado do Consumidor = total do Pedido + tarifa de serviço. */
    amountCents: integer("amount_cents").notNull(),
    serviceFeeCents: integer("service_fee_cents").notNull(),
    /** Taxa Foode vigente na criação (snapshot; trocar a tabela não reescreve). */
    foodeFeeId: text("foode_fee_id")
      .notNull()
      .references(() => paymentFees.id),
    foodeFeePercentBps: integer("foode_fee_percent_bps").notNull(),
    foodeFeeFixedCents: integer("foode_fee_fixed_cents").notNull(),
    state: text("state", { enum: PAYMENT_INTENT_STATES }).notNull().default("creating"),
    providerChargeId: text("provider_charge_id"),
    /** PIX: copia-e-cola e QR (PNG em data URL) devolvidos pelo provedor. */
    pixCopyPaste: text("pix_copy_paste"),
    pixQrCode: text("pix_qr_code"),
    expiresAt: text("expires_at"),
    /** Custo informado pelo provedor na cobrança/webhook (`platformFee`), quando houver. */
    providerFeeCents: integer("provider_fee_cents"),
    devMode: integer("dev_mode", { mode: "boolean" }).notNull().default(false),
    /** Início da tentativa de criar a cobrança (lease contra chamadas concorrentes). */
    attemptStartedAt: text("attempt_started_at"),
    /** Última consulta autenticada ao provedor (reconciliação sem webhook). */
    checkedAt: text("checked_at"),
    /** Código curto do erro do provedor (sem corpo nem dado pessoal). */
    failureCode: text("failure_code"),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "payment_intents_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("payment_intents_pix_order_unique")
      .on(table.storeId, table.orderId)
      .where(sql.raw(`"method" = 'pix'`)),
    uniqueIndex("payment_intents_provider_charge_unique").on(
      table.provider,
      table.providerChargeId,
    ),
    index("payment_intents_state_idx").on(table.state, table.expiresAt),
    check("payment_intents_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check("payment_intents_method", sql.raw(inList("method", FEE_PAYMENT_METHODS))),
    check(
      "payment_intents_card_mode",
      sql.raw(
        `("method" = 'credit' AND ${inList("card_mode", CARD_MODES)}) OR ("method" = 'pix' AND "card_mode" IS NULL AND "provider" = 'abacatepay')`,
      ),
    ),
    check("payment_intents_custody", sql.raw(inList("custody", PAYMENT_CUSTODY_MODES))),
    check("payment_intents_amount_cents", centsCheck("amount_cents", 1)),
    check("payment_intents_service_fee_cents", centsCheck("service_fee_cents")),
    check("payment_intents_service_fee_le_amount", sql.raw(`"service_fee_cents" < "amount_cents"`)),
    check(
      "payment_intents_foode_fee_percent_bps",
      sql.raw(`"foode_fee_percent_bps" BETWEEN 0 AND 10000`),
    ),
    check("payment_intents_foode_fee_fixed_cents", centsCheck("foode_fee_fixed_cents")),
    check("payment_intents_state", sql.raw(inList("state", PAYMENT_INTENT_STATES))),
    check(
      "payment_intents_provider_fee_cents",
      sql.raw(
        `"provider_fee_cents" IS NULL OR "provider_fee_cents" BETWEEN 0 AND ${MENU_MAX_CENTS}`,
      ),
    ),
    check(
      "payment_intents_charge_by_state",
      sql.raw(`"state" NOT IN ('pending', 'paid') OR "provider_charge_id" IS NOT NULL`),
    ),
    check("payment_intents_paid_at", sql.raw(`("state" = 'paid') = ("paid_at" IS NOT NULL)`)),
    check(
      "payment_intents_pix_copy_paste",
      sql.raw(`"pix_copy_paste" IS NULL OR length("pix_copy_paste") BETWEEN 1 AND 1024`),
    ),
    check(
      "payment_intents_pix_qr_code",
      sql.raw(`"pix_qr_code" IS NULL OR length("pix_qr_code") <= 200000`),
    ),
    check(
      "payment_intents_failure_code",
      sql.raw(`"failure_code" IS NULL OR length("failure_code") BETWEEN 1 AND 80`),
    ),
    check("payment_intents_expires_at_utc", nullableUtc("expires_at")),
    check("payment_intents_attempt_started_at_utc", nullableUtc("attempt_started_at")),
    check("payment_intents_checked_at_utc", nullableUtc("checked_at")),
    check("payment_intents_paid_at_utc", nullableUtc("paid_at")),
    check("payment_intents_created_at_utc", utcCheck("created_at")),
    check("payment_intents_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const paymentWebhookEvents = sqliteTable(
  "payment_webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    /** Identidade do evento no provedor (AbacatePay: `log_…`, igual em toda reentrega). */
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    providerChargeId: text("provider_charge_id"),
    intentId: text("intent_id").references(() => paymentIntents.id),
    outcome: text("outcome", { enum: WEBHOOK_EVENT_OUTCOMES }).notNull(),
    devMode: integer("dev_mode", { mode: "boolean" }).notNull().default(false),
    receivedAt: text("received_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_identity_unique").on(table.provider, table.eventId),
    index("payment_webhook_events_intent_idx").on(table.intentId),
    check("payment_webhook_events_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check("payment_webhook_events_outcome", sql.raw(inList("outcome", WEBHOOK_EVENT_OUTCOMES))),
    check("payment_webhook_events_event_id", sql.raw(`length("event_id") BETWEEN 1 AND 200`)),
    check("payment_webhook_events_event_type", sql.raw(`length("event_type") BETWEEN 1 AND 80`)),
    check("payment_webhook_events_received_at_utc", utcCheck("received_at")),
  ],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    intentId: text("intent_id")
      .notNull()
      .references(() => paymentIntents.id),
    kind: text("kind", { enum: LEDGER_ENTRY_KINDS }).notNull().default("payment"),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    method: text("method", { enum: FEE_PAYMENT_METHODS }).notNull(),
    cardMode: text("card_mode", { enum: CARD_MODES }),
    custody: text("custody", { enum: PAYMENT_CUSTODY_MODES }).notNull().default("pilot_platform"),
    /** O que o Consumidor pagou (total do Pedido + tarifa de serviço). */
    chargedCents: integer("charged_cents").notNull(),
    /** Total do Pedido do lojista (base da taxa Foode). */
    orderTotalCents: integer("order_total_cents").notNull(),
    /** Tarifa de serviço: receita da Foode, nunca repassada. */
    serviceFeeCents: integer("service_fee_cents").notNull(),
    foodeFeeCents: integer("foode_fee_cents").notNull(),
    foodeFeeId: text("foode_fee_id")
      .notNull()
      .references(() => paymentFees.id),
    /** Custo do provedor para a Foode (Ops); null = desconhecido na confirmação. */
    providerCostCents: integer("provider_cost_cents"),
    /** Líquido a repassar ao lojista = total do Pedido − taxa Foode. */
    netCents: integer("net_cents").notNull(),
    /** Data civil (São Paulo) da liberação no provedor. */
    releaseDate: text("release_date").notNull(),
    /** Repasse previsto = 1º dia útil depois da liberação. */
    expectedPayoutDate: text("expected_payout_date").notNull(),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "ledger_entries_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("ledger_entries_payment_intent_unique")
      .on(table.intentId)
      .where(sql.raw(`"kind" = 'payment'`)),
    index("ledger_entries_store_payout_idx").on(table.storeId, table.expectedPayoutDate),
    check("ledger_entries_kind", sql.raw(inList("kind", LEDGER_ENTRY_KINDS))),
    check("ledger_entries_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check("ledger_entries_method", sql.raw(inList("method", FEE_PAYMENT_METHODS))),
    check("ledger_entries_custody", sql.raw(inList("custody", PAYMENT_CUSTODY_MODES))),
    check("ledger_entries_charged_cents", centsCheck("charged_cents", 1)),
    check("ledger_entries_order_total_cents", centsCheck("order_total_cents")),
    check("ledger_entries_service_fee_cents", centsCheck("service_fee_cents")),
    check("ledger_entries_foode_fee_cents", centsCheck("foode_fee_cents")),
    check(
      "ledger_entries_provider_cost_cents",
      sql.raw(
        `"provider_cost_cents" IS NULL OR "provider_cost_cents" BETWEEN 0 AND ${MENU_MAX_CENTS}`,
      ),
    ),
    check(
      "ledger_entries_sums",
      sql.raw(
        `"charged_cents" = "order_total_cents" + "service_fee_cents" AND "foode_fee_cents" <= "order_total_cents" AND "net_cents" = "order_total_cents" - "foode_fee_cents"`,
      ),
    ),
    check("ledger_entries_release_date", civilDateCheck("release_date")),
    check("ledger_entries_expected_payout_date", civilDateCheck("expected_payout_date")),
    check(
      "ledger_entries_payout_after_release",
      sql.raw(`"expected_payout_date" > "release_date"`),
    ),
    check("ledger_entries_occurred_at_utc", utcCheck("occurred_at")),
    check("ledger_entries_created_at_utc", utcCheck("created_at")),
  ],
);

export type PaymentIntentRow = typeof paymentIntents.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
