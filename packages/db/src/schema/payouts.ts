// Lotes diários de repasse e ajustes (Ticket 14, migration 0012; decisões 60, 61 e 71; OPS-04). Só
// expand: três tabelas novas; nada em tabela existente muda. Reusa `ledger_entry_payouts`
// (Ticket 12): o lote pago grava ali cada lançamento repassado, e é isso que decide se um Estorno
// posterior vira anulação ou débito compensado.
//
// - `payout_batches`: o Pix que o Ops fez para uma Loja (um lote = um Pix), com data de corte
//   (`payout_date`: itens com repasse previsto até ela), data do Pix, conta de saída (Efí ou
//   AbacatePay), identificador/comprovante, custo do envio (custo da Foode, nunca exibido ao
//   lojista) e os totais (CHECK: valor = lançamentos − débitos + ajustes, sempre > 0).
//   IMUTÁVEL: nenhuma operação de @foode/db faz UPDATE/DELETE aqui; correção = ajuste.
//   `idempotency_key` UNIQUE: repetir o "marcar pago" devolve o mesmo lote.
// - `payout_batch_items`: o que entrou em cada lote (lançamento, retenção, débito de Estorno ou
//   ajuste), com o valor assinado. UNIQUE (kind, item_id): nada é pago/compensado duas vezes.
//   `item_id` é polimórfico (ledger_entries / ledger_retentions / ledger_reversals /
//   payout_adjustments), por isso sem FK; quem grava é só `payout-db.ts`.
// - `payout_adjustments`: lançamento de ajuste auditado do Ops (crédito + / débito −), com motivo
//   e o lote corrigido (opcional, FK composta: só lote da MESMA Loja). Entra no próximo lote.
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

/** = `PAYOUT_SOURCE_ACCOUNTS` de @foode/shared/finance. */
export const PAYOUT_SOURCE_ACCOUNTS = ["efi", "abacatepay"] as const;
/** = `PAYOUT_ITEM_KINDS` de @foode/shared/finance. */
export const PAYOUT_ITEM_KINDS = ["entry", "retention", "debit", "adjustment"] as const;
export const PAYOUT_REFERENCE_MAX = 120;
export const PAYOUT_ADJUSTMENT_REASON_MAX = 200;

function civilDateCheck(column: string) {
  return sql.raw(`strftime('%Y-%m-%d', "${column}") IS "${column}"`);
}

function centsCheck(column: string, min = 0) {
  return sql.raw(`"${column}" BETWEEN ${min} AND ${MENU_MAX_CENTS}`);
}

function signedCentsCheck(column: string) {
  return sql.raw(`"${column}" BETWEEN -${MENU_MAX_CENTS} AND ${MENU_MAX_CENTS}`);
}

export const payoutBatches = sqliteTable(
  "payout_batches",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** Data de corte do lote: itens com repasse previsto até ela. */
    payoutDate: text("payout_date").notNull(),
    /** Data do Pix informada pelo Ops. */
    paidOn: text("paid_on").notNull(),
    sourceAccount: text("source_account", { enum: PAYOUT_SOURCE_ACCOUNTS }).notNull(),
    /** Identificador/comprovante do Pix (E2E ou id do provedor). */
    reference: text("reference").notNull(),
    /** Custo do envio do Pix (Foode; nunca exibido ao lojista). */
    transferCostCents: integer("transfer_cost_cents").notNull(),
    entriesCents: integer("entries_cents").notNull(),
    debitsCents: integer("debits_cents").notNull(),
    adjustmentsCents: integer("adjustments_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    itemCount: integer("item_count").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("payout_batches_store_id_unique").on(table.storeId, table.id),
    uniqueIndex("payout_batches_idempotency_unique").on(table.idempotencyKey),
    index("payout_batches_store_paid_on_idx").on(table.storeId, table.paidOn),
    index("payout_batches_paid_on_idx").on(table.paidOn),
    check("payout_batches_payout_date", civilDateCheck("payout_date")),
    check("payout_batches_paid_on", civilDateCheck("paid_on")),
    check("payout_batches_paid_after_cut", sql.raw(`"paid_on" >= "payout_date"`)),
    check(
      "payout_batches_source_account",
      sql.raw(inList("source_account", PAYOUT_SOURCE_ACCOUNTS)),
    ),
    check(
      "payout_batches_reference",
      sql.raw(`length(trim("reference")) BETWEEN 1 AND ${PAYOUT_REFERENCE_MAX}`),
    ),
    check("payout_batches_transfer_cost_cents", centsCheck("transfer_cost_cents")),
    check("payout_batches_entries_cents", centsCheck("entries_cents")),
    check("payout_batches_debits_cents", centsCheck("debits_cents")),
    check("payout_batches_adjustments_cents", signedCentsCheck("adjustments_cents")),
    check("payout_batches_amount_cents", centsCheck("amount_cents", 1)),
    check(
      "payout_batches_sums",
      sql.raw(`"amount_cents" = "entries_cents" - "debits_cents" + "adjustments_cents"`),
    ),
    check("payout_batches_item_count", sql.raw(`"item_count" >= 1`)),
    check("payout_batches_idempotency_key", sql.raw(`length("idempotency_key") = 36`)),
    check("payout_batches_created_at_utc", utcCheck("created_at")),
  ],
);

export const payoutBatchItems = sqliteTable(
  "payout_batch_items",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    kind: text("kind", { enum: PAYOUT_ITEM_KINDS }).notNull(),
    /** Lançamento, retenção, reversão ou ajuste (polimórfico; sem FK). */
    itemId: text("item_id").notNull(),
    /** Valor assinado no lote: débito negativo; ajuste com o próprio sinal. */
    amountCents: integer("amount_cents").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "payout_batch_items_batch_fk",
      columns: [table.storeId, table.batchId],
      foreignColumns: [payoutBatches.storeId, payoutBatches.id],
    }),
    uniqueIndex("payout_batch_items_item_unique").on(table.kind, table.itemId),
    index("payout_batch_items_batch_idx").on(table.batchId),
    check("payout_batch_items_kind", sql.raw(inList("kind", PAYOUT_ITEM_KINDS))),
    check("payout_batch_items_amount_cents", signedCentsCheck("amount_cents")),
    check(
      "payout_batch_items_sign",
      sql.raw(
        `("kind" IN ('entry', 'retention') AND "amount_cents" >= 0) OR ("kind" = 'debit' AND "amount_cents" < 0) OR ("kind" = 'adjustment' AND "amount_cents" <> 0)`,
      ),
    ),
    check("payout_batch_items_created_at_utc", utcCheck("created_at")),
  ],
);

export const payoutAdjustments = sqliteTable(
  "payout_adjustments",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** Crédito (+) ou débito (−) ao lojista. */
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    /** Lote corrigido (opcional), sempre da mesma Loja. */
    relatedBatchId: text("related_batch_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "payout_adjustments_batch_fk",
      columns: [table.storeId, table.relatedBatchId],
      foreignColumns: [payoutBatches.storeId, payoutBatches.id],
    }),
    index("payout_adjustments_store_idx").on(table.storeId, table.createdAt),
    check("payout_adjustments_amount_cents", signedCentsCheck("amount_cents")),
    check("payout_adjustments_amount_not_zero", sql.raw(`"amount_cents" <> 0`)),
    check(
      "payout_adjustments_reason",
      sql.raw(`length(trim("reason")) BETWEEN 3 AND ${PAYOUT_ADJUSTMENT_REASON_MAX}`),
    ),
    check("payout_adjustments_created_at_utc", utcCheck("created_at")),
  ],
);

export type PayoutBatchRow = typeof payoutBatches.$inferSelect;
export type PayoutBatchItemRow = typeof payoutBatchItems.$inferSelect;
export type PayoutAdjustmentRow = typeof payoutAdjustments.$inferSelect;
