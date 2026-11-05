// Configuração operacional da Loja no D1 (Ticket 24a, migration 0004; comportamento dos Tickets
// 07/09 + decisões 41, 42, 58 e 63). O checkout lê; o Painel (24b) edita. Contrato em
// @foode/shared/order (settings.ts, hours.ts); os limites daqui são os mesmos (conferidos em
// apps/api/src/order-contract.test.ts).
//
// - `store_operation_settings`: uma linha por Loja (PK = store_id). Sem linha = tudo desligado
//   (sem Retirada, sem Delivery, sem Pausa, sem tempos, sem bandeiras), e a Loja fica fechada.
// - Pausa com quem ativou e quando (P-OPE-4: Dono ou Operador); só preenchido com a Pausa ligada.
//   O histórico de ativação/retomada fica em `audit_events` (`store.pause`/`store.resume`).
// - Delivery: `delivery_mode` NULL = desligado; 'fixed' exige `delivery_fixed_fee_cents`; a Taxa
//   fixa e os bairros do outro modo ficam guardados (resíduo do modo inativo não vale).
//   "Pelo menos um bairro ativo" no modo 'neighborhood' é regra do servidor (não cabe em CHECK).
// - Bandeiras em JSON (array de CARD_BRANDS, validado com Zod; o CHECK garante só array).
// - Horários: `store_opening_periods`, `HH:MM` civil de America/Sao_Paulo, `opens_at < closes_at`
//   (sem overnight, decisão 58). Sobreposição e máximo por dia são conferidos no servidor.
// - Bairros: `delivery_neighborhoods` com `active` (P-CFG-5) e nome normalizado único por Loja.
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";
import { MENU_MAX_CENTS } from "./menu";

export const DELIVERY_MODES = ["neighborhood", "fixed"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** Quem pode ativar a Pausa (P-OPE-4). */
export const PAUSE_ROLES = ["owner", "operator"] as const;

/** Teto do tempo estimado em minutos (= MAX_ETA_MINUTES de @foode/shared/order). */
export const ETA_MAX_MINUTES = 240;
/** Nome do bairro (= NEIGHBORHOOD_NAME_MAX de @foode/shared/order). */
export const NEIGHBORHOOD_NAME_MAX = 120;

function boolCheck(column: string) {
  return sql.raw(`"${column}" IN (0, 1)`);
}

function etaCheck(prefix: string) {
  const min = `"${prefix}_eta_min_minutes"`;
  const max = `"${prefix}_eta_max_minutes"`;
  return sql.raw(
    `(${min} IS NULL AND ${max} IS NULL) OR (${min} BETWEEN 1 AND ${ETA_MAX_MINUTES} AND ${max} BETWEEN 1 AND ${ETA_MAX_MINUTES} AND ${min} <= ${max})`,
  );
}

function civilTimeCheck(column: string) {
  // `strftime('%H:%M', 'HH:MM')` devolve o próprio valor só para horário válido (sem GLOB/LIKE).
  return sql.raw(`strftime('%H:%M', "${column}") IS "${column}"`);
}

export const storeOperationSettings = sqliteTable(
  "store_operation_settings",
  {
    storeId: text("store_id")
      .primaryKey()
      .references(() => stores.id),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    pausedAt: text("paused_at"),
    pausedByUserId: text("paused_by_user_id").references(() => users.id),
    pausedByRole: text("paused_by_role", { enum: PAUSE_ROLES }),
    pickupEnabled: integer("pickup_enabled", { mode: "boolean" }).notNull().default(false),
    deliveryMode: text("delivery_mode", { enum: DELIVERY_MODES }),
    deliveryFixedFeeCents: integer("delivery_fixed_fee_cents"),
    /** Pedido mínimo do Delivery sobre o subtotal dos itens; NULL = sem mínimo. */
    deliveryMinimumOrderCents: integer("delivery_minimum_order_cents"),
    deliveryEtaMinMinutes: integer("delivery_eta_min_minutes"),
    deliveryEtaMaxMinutes: integer("delivery_eta_max_minutes"),
    pickupEtaMinMinutes: integer("pickup_eta_min_minutes"),
    pickupEtaMaxMinutes: integer("pickup_eta_max_minutes"),
    debitBrands: text("debit_brands").notNull().default("[]"),
    creditBrands: text("credit_brands").notNull().default("[]"),
    printOnAccept: integer("print_on_accept", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  () => [
    check("store_operation_settings_paused_bool", boolCheck("paused")),
    check(
      "store_operation_settings_pause_actor",
      sql.raw(
        `("paused" = 0 AND "paused_at" IS NULL AND "paused_by_user_id" IS NULL AND "paused_by_role" IS NULL) OR ("paused" = 1 AND "paused_at" IS NOT NULL AND "paused_by_user_id" IS NOT NULL AND "paused_by_role" IS NOT NULL)`,
      ),
    ),
    check(
      "store_operation_settings_paused_by_role",
      sql.raw(`"paused_by_role" IS NULL OR ${inList("paused_by_role", PAUSE_ROLES)}`),
    ),
    check(
      "store_operation_settings_paused_at_utc",
      sql.raw(`"paused_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "paused_at") IS "paused_at"`),
    ),
    check("store_operation_settings_pickup_bool", boolCheck("pickup_enabled")),
    check(
      "store_operation_settings_delivery_mode",
      sql.raw(`"delivery_mode" IS NULL OR ${inList("delivery_mode", DELIVERY_MODES)}`),
    ),
    check(
      "store_operation_settings_fixed_fee",
      sql.raw(
        `("delivery_fixed_fee_cents" IS NULL OR "delivery_fixed_fee_cents" BETWEEN 0 AND ${MENU_MAX_CENTS}) AND ("delivery_mode" IS NOT 'fixed' OR "delivery_fixed_fee_cents" IS NOT NULL)`,
      ),
    ),
    check(
      "store_operation_settings_minimum_order",
      sql.raw(
        `"delivery_minimum_order_cents" IS NULL OR "delivery_minimum_order_cents" BETWEEN 1 AND ${MENU_MAX_CENTS}`,
      ),
    ),
    check("store_operation_settings_delivery_eta", etaCheck("delivery")),
    check("store_operation_settings_pickup_eta", etaCheck("pickup")),
    check(
      "store_operation_settings_debit_brands",
      sql.raw(`json_valid("debit_brands") AND json_type("debit_brands") = 'array'`),
    ),
    check(
      "store_operation_settings_credit_brands",
      sql.raw(`json_valid("credit_brands") AND json_type("credit_brands") = 'array'`),
    ),
    check("store_operation_settings_print_bool", boolCheck("print_on_accept")),
    check("store_operation_settings_created_at_utc", utcCheck("created_at")),
    check("store_operation_settings_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Período de funcionamento: dia ISO (1 = segunda … 7 = domingo), `HH:MM` local, início < fim. */
export const storeOpeningPeriods = sqliteTable(
  "store_opening_periods",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    weekday: integer("weekday").notNull(),
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("store_opening_periods_store_day_open_unique").on(
      table.storeId,
      table.weekday,
      table.opensAt,
    ),
    check("store_opening_periods_weekday", sql.raw(`"weekday" BETWEEN 1 AND 7`)),
    check("store_opening_periods_opens_at", civilTimeCheck("opens_at")),
    check("store_opening_periods_closes_at", civilTimeCheck("closes_at")),
    check("store_opening_periods_order", sql.raw(`"opens_at" < "closes_at"`)),
    check("store_opening_periods_created_at_utc", utcCheck("created_at")),
  ],
);

/** Bairro atendido no modo "por bairro". `active` = 0 não aparece nem é aceito (P-CFG-5). */
export const deliveryNeighborhoods = sqliteTable(
  "delivery_neighborhoods",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    /** `normalizeNeighborhoodKey` de @foode/shared (sem acento, minúsculo, espaços colapsados). */
    normalizedName: text("normalized_name").notNull(),
    feeCents: integer("fee_cents").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("delivery_neighborhoods_store_id_unique").on(table.storeId, table.id),
    uniqueIndex("delivery_neighborhoods_store_name_unique").on(table.storeId, table.normalizedName),
    index("delivery_neighborhoods_store_position_idx").on(table.storeId, table.position),
    check(
      "delivery_neighborhoods_name",
      sql.raw(`length(trim("name")) BETWEEN 1 AND ${NEIGHBORHOOD_NAME_MAX}`),
    ),
    check(
      "delivery_neighborhoods_normalized_name",
      sql.raw(`length("normalized_name") BETWEEN 1 AND ${NEIGHBORHOOD_NAME_MAX}`),
    ),
    check(
      "delivery_neighborhoods_fee_cents",
      sql.raw(`"fee_cents" BETWEEN 0 AND ${MENU_MAX_CENTS}`),
    ),
    check("delivery_neighborhoods_active_bool", boolCheck("active")),
    check("delivery_neighborhoods_position", sql.raw(`"position" >= 0`)),
    check("delivery_neighborhoods_created_at_utc", utcCheck("created_at")),
    check("delivery_neighborhoods_updated_at_utc", utcCheck("updated_at")),
  ],
);

export type StoreOperationSettingsRow = typeof storeOperationSettings.$inferSelect;
export type StoreOpeningPeriodRow = typeof storeOpeningPeriods.$inferSelect;
export type DeliveryNeighborhoodRow = typeof deliveryNeighborhoods.$inferSelect;
