// Reconciliação por Cron Trigger (Ticket 15, migration 0011; decisões 59 e 60). Só expand: duas
// tabelas novas e uma coluna nullable em `order_cancellations` (refunds.ts).
//
// - `maintenance_locks`: trava leve por rotina do Cron (uma linha por nome). Duas execuções
//   sobrepostas (Cron atrasado + o próximo, ou disparo manual) disputam um UPSERT condicional; só
//   quem grava o próprio `holder` roda. A trava vence sozinha (`locked_until`) se o Worker morrer
//   no meio. Guarda o resumo da última execução (só contagens, nunca dado pessoal).
// - `ledger_release_confirmations`: a liberação do Cartão foi CONFIRMADA no provedor (Efí
//   `paid`/`settled`, AbacatePay `PAID`). Uma por lançamento (PK): guarda as datas anteriores do
//   lançamento (prazo máximo) e a confirmada. A confirmação só move a data de repasse PREVISTA
//   (`ledger_entries.expected_payout_date`); repasse efetivo continua sendo só
//   `ledger_entry_payouts` (lote pago do Ticket 14).
import { sql } from "drizzle-orm";
import { check, foreignKey, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { inList, stores, utcCheck, utcNowDefault } from "./fundacao";
import { PAYMENT_PROVIDERS } from "./ops";
import { orders } from "./orders";
import { ledgerEntries } from "./payments";

/** Rotinas do Cron com trava própria. */
export const MAINTENANCE_LOCK_NAMES = ["payments", "settlement"] as const;
export type MaintenanceLockName = (typeof MAINTENANCE_LOCK_NAMES)[number];

/** Resumo da última execução (JSON só com contagens). */
export const MAINTENANCE_SUMMARY_MAX = 4000;

function nullableUtc(column: string) {
  return sql.raw(
    `"${column}" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "${column}") IS "${column}"`,
  );
}

function civilDateCheck(column: string) {
  return sql.raw(`strftime('%Y-%m-%d', "${column}") IS "${column}"`);
}

export const maintenanceLocks = sqliteTable(
  "maintenance_locks",
  {
    name: text("name", { enum: MAINTENANCE_LOCK_NAMES }).primaryKey(),
    /** Execução que segura a trava (UUID gerado no Worker); null = livre. */
    holder: text("holder"),
    /** A trava vence aqui (Worker que morreu no meio não prende a próxima execução). */
    lockedUntil: text("locked_until"),
    acquiredAt: text("acquired_at"),
    lastFinishedAt: text("last_finished_at"),
    /** Resumo JSON da última execução: contagens por unidade e falhas (sem dado pessoal). */
    lastSummary: text("last_summary"),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  () => [
    check("maintenance_locks_name", sql.raw(inList("name", MAINTENANCE_LOCK_NAMES))),
    check("maintenance_locks_holder", sql.raw(`("holder" IS NULL) = ("locked_until" IS NULL)`)),
    check("maintenance_locks_locked_until_utc", nullableUtc("locked_until")),
    check("maintenance_locks_acquired_at_utc", nullableUtc("acquired_at")),
    check("maintenance_locks_last_finished_at_utc", nullableUtc("last_finished_at")),
    check(
      "maintenance_locks_last_summary",
      sql.raw(
        `"last_summary" IS NULL OR length("last_summary") BETWEEN 2 AND ${MAINTENANCE_SUMMARY_MAX}`,
      ),
    ),
    check("maintenance_locks_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const ledgerReleaseConfirmations = sqliteTable(
  "ledger_release_confirmations",
  {
    ledgerEntryId: text("ledger_entry_id")
      .primaryKey()
      .references(() => ledgerEntries.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    /** Status cru e curto do provedor que confirmou (`paid`, `settled`, `PAID`). */
    providerStatus: text("provider_status").notNull(),
    /** Data civil (São Paulo) em que a liberação foi vista no provedor. */
    releaseDate: text("release_date").notNull(),
    /** Repasse previsto novo = 1º dia útil depois da liberação confirmada. */
    expectedPayoutDate: text("expected_payout_date").notNull(),
    /** Datas do lançamento antes da confirmação (prazo máximo do modo). */
    previousReleaseDate: text("previous_release_date").notNull(),
    previousExpectedPayoutDate: text("previous_expected_payout_date").notNull(),
    confirmedAt: text("confirmed_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "ledger_release_confirmations_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    index("ledger_release_confirmations_store_idx").on(table.storeId, table.expectedPayoutDate),
    check("ledger_release_confirmations_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check(
      "ledger_release_confirmations_provider_status",
      sql.raw(`length("provider_status") BETWEEN 1 AND 40`),
    ),
    check("ledger_release_confirmations_release_date", civilDateCheck("release_date")),
    check(
      "ledger_release_confirmations_expected_payout_date",
      civilDateCheck("expected_payout_date"),
    ),
    check(
      "ledger_release_confirmations_payout_after_release",
      sql.raw(`"expected_payout_date" > "release_date"`),
    ),
    check(
      "ledger_release_confirmations_previous_release_date",
      civilDateCheck("previous_release_date"),
    ),
    check(
      "ledger_release_confirmations_previous_expected_payout_date",
      civilDateCheck("previous_expected_payout_date"),
    ),
    check("ledger_release_confirmations_confirmed_at_utc", utcCheck("confirmed_at")),
    check("ledger_release_confirmations_created_at_utc", utcCheck("created_at")),
  ],
);

export type MaintenanceLockRow = typeof maintenanceLocks.$inferSelect;
export type LedgerReleaseConfirmationRow = typeof ledgerReleaseConfirmations.$inferSelect;
