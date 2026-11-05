// Cartão de crédito à vista (Ticket 27, migration 0009; decisões 60, 61 e 71; ADR 0007). Só
// expand: tabelas novas + um índice novo em `payment_intents`. Reaproveita o Ticket 26:
//
// - `payment_intents` (method `credit`, `card_mode` normal/rapido, provider efi/abacatepay) segue
//   sendo a intenção de cobrança com o snapshot do dinheiro (valor, tarifa de serviço, taxa Foode)
//   e o estado canônico (creating → pending → paid | failed). O índice parcial
//   `payment_intents_credit_active_unique` garante no máximo UMA tentativa de Cartão viva
//   (creating/pending/paid) por Pedido: recusada (`failed`) libera "Tentar outro cartão".
// - `card_payments` (1:1 com a intenção): o que só o Cartão tem — chave de idempotência da
//   tentativa (`attempt_key`, UUID do navegador), estado público (processing/pending/approved/
//   declined), motivo exibível do recusado, status cru do provedor, bandeira/últimos 4 (exibição),
//   token de notificação da Efí + último evento visto (o histórico da Efí é cumulativo) e a
//   liberação prevista (Efí: até 21 dias úteis; AbacatePay: até 1 dia útil; ou a data informada).
//   Nada de número, CVV, validade, token do cartão, CPF, e-mail ou nascimento: o pagador só passa
//   pela chamada ao provedor.
// - `ledger_retentions`: retenção do provedor como parcela separada do lançamento do Ledger
//   (`ledger_entries`, que continua único por intenção paga), com liberação e repasse próprios.
// Eventos de webhook dos dois provedores continuam em `payment_webhook_events` (provider `efi`,
// `event_id` = `efi:<charge_id>:<id>`). FKs compostas (store_id, order_id) → orders.
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
import { orders } from "./orders";
import { ledgerEntries, paymentIntents } from "./payments";

/** Estado público do Cartão (= `CARD_PAYMENT_STATES` de @foode/shared/payment). */
export const CARD_PAYMENT_STATES = ["processing", "pending", "approved", "declined"] as const;
export type CardPaymentState = (typeof CARD_PAYMENT_STATES)[number];

/** Motivo exibível do recusado (= `CARD_DECLINE_REASONS` de @foode/shared/payment). */
export const CARD_DECLINE_REASONS = [
  "issuer_declined",
  "invalid_payer_data",
  "token_expired",
  "provider_unavailable",
  "unknown",
] as const;
export type CardDeclineReason = (typeof CARD_DECLINE_REASONS)[number];

/** Bandeira para exibição (= `CARD_PAYMENT_BRANDS` de @foode/shared/payment). */
export const CARD_PAYMENT_BRANDS = [
  "visa",
  "mastercard",
  "elo",
  "amex",
  "hipercard",
  "diners",
  "other",
] as const;

/** Origem da liberação prevista: data informada pelo provedor ou o prazo máximo do modo. */
export const CARD_RELEASE_SOURCES = ["informed", "max_term"] as const;
export type CardReleaseSource = (typeof CARD_RELEASE_SOURCES)[number];

export const LEDGER_RETENTION_REASONS = ["provider_retention"] as const;

export const CARD_PROVIDER_STATUS_MAX = 40;
export const EFI_NOTIFICATION_TOKEN_MAX = 128;

function nullableUtc(column: string) {
  return sql.raw(
    `"${column}" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "${column}") IS "${column}"`,
  );
}

function civilDateCheck(column: string) {
  return sql.raw(`strftime('%Y-%m-%d', "${column}") IS "${column}"`);
}

export const cardPayments = sqliteTable(
  "card_payments",
  {
    /** Mesma chave da intenção (1:1). */
    intentId: text("intent_id")
      .primaryKey()
      .references(() => paymentIntents.id),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    /**
     * Idempotência da tentativa: a 1ª é a `idempotencyKey` do checkout; "Tentar outro cartão"
     * manda uma nova. Mesma chave = mesma intenção, sem cobrar duas vezes.
     */
    attemptKey: text("attempt_key").notNull(),
    state: text("state", { enum: CARD_PAYMENT_STATES }).notNull().default("processing"),
    declineReason: text("decline_reason", { enum: CARD_DECLINE_REASONS }),
    /** Status cru e curto do provedor (`waiting`, `unpaid`, `APPROVED`…), sem corpo. */
    providerStatus: text("provider_status"),
    brand: text("brand", { enum: CARD_PAYMENT_BRANDS }),
    lastFour: text("last_four"),
    /** Efí: token da `notification_url` (o mesmo em todo o ciclo da cobrança). */
    efiNotificationToken: text("efi_notification_token"),
    /** Efí: maior `id` de evento já processado (histórico cumulativo). */
    efiLastEventId: integer("efi_last_event_id"),
    approvedAt: text("approved_at"),
    /** Liberação prevista no provedor (data civil de São Paulo). */
    expectedReleaseDate: text("expected_release_date"),
    releaseSource: text("release_source", { enum: CARD_RELEASE_SOURCES }),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "card_payments_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("card_payments_attempt_unique").on(table.storeId, table.orderId, table.attemptKey),
    uniqueIndex("card_payments_efi_token_unique")
      .on(table.efiNotificationToken)
      .where(sql.raw(`"efi_notification_token" IS NOT NULL`)),
    check(
      "card_payments_attempt_key",
      sql.raw(`length("attempt_key") = 36 AND "attempt_key" = lower("attempt_key")`),
    ),
    check("card_payments_state", sql.raw(inList("state", CARD_PAYMENT_STATES))),
    check(
      "card_payments_decline_reason",
      sql.raw(
        `("state" = 'declined' AND ${inList("decline_reason", CARD_DECLINE_REASONS)}) OR ("state" <> 'declined' AND "decline_reason" IS NULL)`,
      ),
    ),
    check(
      "card_payments_provider_status",
      sql.raw(
        `"provider_status" IS NULL OR length("provider_status") BETWEEN 1 AND ${CARD_PROVIDER_STATUS_MAX}`,
      ),
    ),
    check(
      "card_payments_brand",
      sql.raw(`"brand" IS NULL OR ${inList("brand", CARD_PAYMENT_BRANDS)}`),
    ),
    check(
      "card_payments_last_four",
      sql.raw(`"last_four" IS NULL OR "last_four" GLOB '[0-9][0-9][0-9][0-9]'`),
    ),
    check(
      "card_payments_efi_notification_token",
      sql.raw(
        `"efi_notification_token" IS NULL OR length("efi_notification_token") BETWEEN 8 AND ${EFI_NOTIFICATION_TOKEN_MAX}`,
      ),
    ),
    check(
      "card_payments_efi_last_event_id",
      sql.raw(`"efi_last_event_id" IS NULL OR "efi_last_event_id" >= 0`),
    ),
    check(
      "card_payments_approved_at",
      sql.raw(`("state" = 'approved') = ("approved_at" IS NOT NULL)`),
    ),
    check("card_payments_approved_at_utc", nullableUtc("approved_at")),
    check(
      "card_payments_expected_release_date",
      sql.raw(
        `("expected_release_date" IS NULL AND "release_source" IS NULL) OR (strftime('%Y-%m-%d', "expected_release_date") IS "expected_release_date" AND ${inList("release_source", CARD_RELEASE_SOURCES)})`,
      ),
    ),
    check("card_payments_created_at_utc", utcCheck("created_at")),
    check("card_payments_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const ledgerRetentions = sqliteTable(
  "ledger_retentions",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntries.id),
    reason: text("reason", { enum: LEDGER_RETENTION_REASONS })
      .notNull()
      .default("provider_retention"),
    /** Parte do líquido do lançamento que o provedor libera depois. */
    amountCents: integer("amount_cents").notNull(),
    releaseDate: text("release_date").notNull(),
    /** 1º dia útil depois da liberação da retenção. */
    expectedPayoutDate: text("expected_payout_date").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "ledger_retentions_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("ledger_retentions_entry_release_unique").on(
      table.ledgerEntryId,
      table.releaseDate,
    ),
    index("ledger_retentions_store_payout_idx").on(table.storeId, table.expectedPayoutDate),
    check("ledger_retentions_reason", sql.raw(inList("reason", LEDGER_RETENTION_REASONS))),
    check(
      "ledger_retentions_amount_cents",
      sql.raw(`"amount_cents" BETWEEN 1 AND ${MENU_MAX_CENTS}`),
    ),
    check("ledger_retentions_release_date", civilDateCheck("release_date")),
    check("ledger_retentions_expected_payout_date", civilDateCheck("expected_payout_date")),
    check(
      "ledger_retentions_payout_after_release",
      sql.raw(`"expected_payout_date" > "release_date"`),
    ),
    check("ledger_retentions_created_at_utc", utcCheck("created_at")),
  ],
);

export type CardPaymentRow = typeof cardPayments.$inferSelect;
export type LedgerRetentionRow = typeof ledgerRetentions.$inferSelect;
