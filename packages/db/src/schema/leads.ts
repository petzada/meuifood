// Leads da landing (Ticket 31, decisão 70; migration 0008, expand). Formulário curto: nome,
// WhatsApp, loja, cidade e pedidos/dia, gravado pela rota pública da api (Turnstile + rate limit
// por IP) e lido só pelo Ops. Não é dado de Loja: sem `store_id`. O IP não é gravado (só a chave
// com hash do rate limit, que expira). Mudança de status é auditada (`lead.status_changed`).
import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { inList, users, utcCheck, utcNowDefault } from "./fundacao";

/** Faixas de pedidos por dia do formulário (= ORDERS_PER_DAY_OPTIONS de @foode/shared/lead). */
export const LEAD_ORDERS_PER_DAY = ["ate_10", "10_a_50", "mais_de_50"] as const;
/** Status do lead no Ops (= LEAD_STATUSES de @foode/shared/lead). */
export const LEAD_STATUSES = ["new", "contacted", "converted", "discarded"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Limites de texto (= LEAD_LIMITS de @foode/shared/lead). */
export const LEAD_NAME_MAX = 80;
export const LEAD_STORE_NAME_MAX = 80;
export const LEAD_CITY_MAX = 60;
export const LEAD_SOURCE_MAX = 120;

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Celular BR normalizado (`55DDD9…`, 13 dígitos). */
    whatsapp: text("whatsapp").notNull(),
    storeName: text("store_name").notNull(),
    city: text("city").notNull(),
    ordersPerDay: text("orders_per_day", { enum: LEAD_ORDERS_PER_DAY }).notNull(),
    /** Seção/UTM de origem (só rastreio). */
    source: text("source"),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
    statusChangedAt: text("status_changed_at"),
    statusChangedByUserId: text("status_changed_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    index("leads_created_idx").on(table.createdAt),
    index("leads_status_created_idx").on(table.status, table.createdAt),
    check("leads_name_length", sql.raw(`length(trim("name")) BETWEEN 2 AND ${LEAD_NAME_MAX}`)),
    check("leads_whatsapp_length", sql.raw(`length("whatsapp") = 13`)),
    check(
      "leads_store_name_length",
      sql.raw(`length(trim("store_name")) BETWEEN 2 AND ${LEAD_STORE_NAME_MAX}`),
    ),
    check("leads_city_length", sql.raw(`length(trim("city")) BETWEEN 2 AND ${LEAD_CITY_MAX}`)),
    check(
      "leads_source_length",
      sql.raw(`"source" IS NULL OR length("source") BETWEEN 1 AND ${LEAD_SOURCE_MAX}`),
    ),
    check("leads_orders_per_day", sql.raw(inList("orders_per_day", LEAD_ORDERS_PER_DAY))),
    check("leads_status", sql.raw(inList("status", LEAD_STATUSES))),
    check(
      "leads_status_changed_at_utc",
      sql.raw(
        `"status_changed_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "status_changed_at") IS "status_changed_at"`,
      ),
    ),
    check("leads_created_at_utc", utcCheck("created_at")),
    check("leads_updated_at_utc", utcCheck("updated_at")),
  ],
);
