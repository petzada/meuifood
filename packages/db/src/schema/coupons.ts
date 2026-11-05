// Cupons da Loja (Ticket 13, migration 0006; decisões 45, 62, 63, 66). Só expand: tabelas novas.
// Regras puras em @foode/shared/coupon; limites conferidos em apps/api/src/coupon-contract.test.ts.
//
// - `coupons`: Cupom promocional por Loja. Código único POR LOJA (maiúsculas), % (com teto em R$
//   opcional, P-CUP-1) ou R$, pedido mínimo, validade por data civil de São Paulo (`starts_on` e
//   `ends_on` inclusivos, `YYYY-MM-DD`), dias da semana em máscara de bits ISO (bit 0 = segunda …
//   bit 6 = domingo; 0 = todos os dias, P-CUP-3), limite total de usos e ativo/inativo.
//   `used_count` só sobe na mesma escrita do Pedido (batch com a condição `used_count <
//   usage_limit`); o CHECK `used_count <= usage_limit` é a última barreira contra corrida.
//   `updated_at` é a versão que a escrita do Pedido confere (Cupom editado = recotar).
// - `store_welcome_coupons` (1:1): Cupom de boas-vindas opt-in da Loja (decisão 66): primeira
//   compra da conta NAQUELA Loja; sem linha = programa desligado.
// - `coupon_redemptions`: uso de Cupom por Pedido (um por Pedido: UNIQUE). Boas-vindas: uma vez
//   por conta por Loja (UNIQUE parcial). FKs compostas: nada aponta para Pedido/Cupom de outra Loja.
// - `orders.customer_account_id` (coluna nova, nullable): Pedido ligado à conta do Consumidor.
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

import { customerAccounts } from "./customers";
import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";
import { MENU_MAX_CENTS } from "./menu";
import { orders } from "./orders";

export const COUPON_KINDS = ["percent", "fixed"] as const;
export const COUPON_REDEMPTION_SOURCES = ["promo", "welcome"] as const;
export const COUPON_CODE_MIN = 3;
export const COUPON_CODE_MAX = 20;
/** Máscara com os 7 dias (bit 0 = segunda … bit 6 = domingo). */
export const COUPON_WEEKDAYS_ALL = 127;

function optionalCents(column: string) {
  return sql.raw(`"${column}" IS NULL OR "${column}" BETWEEN 1 AND ${MENU_MAX_CENTS}`);
}

function optionalDate(column: string) {
  return sql.raw(`"${column}" IS NULL OR date("${column}") IS "${column}"`);
}

/** % ou R$: cada tipo com os seus campos (teto só no %). */
const KIND_FIELDS = `("kind" = 'percent' AND "percent" BETWEEN 1 AND 100 AND "amount_cents" IS NULL) OR ("kind" = 'fixed' AND "amount_cents" BETWEEN 1 AND ${MENU_MAX_CENTS} AND "percent" IS NULL AND "max_discount_cents" IS NULL)`;

export const coupons = sqliteTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    code: text("code").notNull(),
    kind: text("kind", { enum: COUPON_KINDS }).notNull(),
    percent: integer("percent"),
    amountCents: integer("amount_cents"),
    maxDiscountCents: integer("max_discount_cents"),
    minOrderCents: integer("min_order_cents"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    weekdays: integer("weekdays").notNull().default(0),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("coupons_store_id_unique").on(table.storeId, table.id),
    uniqueIndex("coupons_store_code_unique").on(table.storeId, table.code),
    check(
      "coupons_code",
      sql.raw(
        `length("code") BETWEEN ${COUPON_CODE_MIN} AND ${COUPON_CODE_MAX} AND "code" NOT GLOB '*[^A-Z0-9_-]*'`,
      ),
    ),
    check("coupons_kind", sql.raw(inList("kind", COUPON_KINDS))),
    check("coupons_kind_fields", sql.raw(KIND_FIELDS)),
    check("coupons_max_discount_cents", optionalCents("max_discount_cents")),
    check("coupons_min_order_cents", optionalCents("min_order_cents")),
    check("coupons_starts_on", optionalDate("starts_on")),
    check("coupons_ends_on", optionalDate("ends_on")),
    check(
      "coupons_period",
      sql.raw(`"starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"`),
    ),
    check("coupons_weekdays", sql.raw(`"weekdays" BETWEEN 0 AND ${COUPON_WEEKDAYS_ALL}`)),
    check("coupons_usage_limit", sql.raw(`"usage_limit" IS NULL OR "usage_limit" >= 1`)),
    check(
      "coupons_used_count",
      sql.raw(`"used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")`),
    ),
    check("coupons_active_bool", sql.raw(`"active" IN (0, 1)`)),
    check("coupons_created_at_utc", utcCheck("created_at")),
    check("coupons_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const storeWelcomeCoupons = sqliteTable(
  "store_welcome_coupons",
  {
    storeId: text("store_id")
      .primaryKey()
      .references(() => stores.id),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    kind: text("kind", { enum: COUPON_KINDS }).notNull(),
    percent: integer("percent"),
    amountCents: integer("amount_cents"),
    maxDiscountCents: integer("max_discount_cents"),
    minOrderCents: integer("min_order_cents"),
    updatedByUserId: text("updated_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  () => [
    check("store_welcome_coupons_active_bool", sql.raw(`"active" IN (0, 1)`)),
    check("store_welcome_coupons_kind", sql.raw(inList("kind", COUPON_KINDS))),
    check("store_welcome_coupons_kind_fields", sql.raw(KIND_FIELDS)),
    check("store_welcome_coupons_max_discount_cents", optionalCents("max_discount_cents")),
    check("store_welcome_coupons_min_order_cents", optionalCents("min_order_cents")),
    check("store_welcome_coupons_created_at_utc", utcCheck("created_at")),
    check("store_welcome_coupons_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const couponRedemptions = sqliteTable(
  "coupon_redemptions",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    source: text("source", { enum: COUPON_REDEMPTION_SOURCES }).notNull(),
    couponId: text("coupon_id"),
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id),
    discountCents: integer("discount_cents").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "coupon_redemptions_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    foreignKey({
      name: "coupon_redemptions_coupon_fk",
      columns: [table.storeId, table.couponId],
      foreignColumns: [coupons.storeId, coupons.id],
    }),
    uniqueIndex("coupon_redemptions_order_unique").on(table.storeId, table.orderId),
    uniqueIndex("coupon_redemptions_welcome_unique")
      .on(table.storeId, table.customerAccountId)
      .where(sql.raw(`"source" = 'welcome'`)),
    index("coupon_redemptions_coupon_idx").on(table.storeId, table.couponId),
    check("coupon_redemptions_source", sql.raw(inList("source", COUPON_REDEMPTION_SOURCES))),
    check(
      "coupon_redemptions_source_fields",
      sql.raw(
        `("source" = 'promo' AND "coupon_id" IS NOT NULL) OR ("source" = 'welcome' AND "coupon_id" IS NULL AND "customer_account_id" IS NOT NULL)`,
      ),
    ),
    check(
      "coupon_redemptions_discount_cents",
      sql.raw(`"discount_cents" BETWEEN 1 AND ${MENU_MAX_CENTS}`),
    ),
    check("coupon_redemptions_created_at_utc", utcCheck("created_at")),
  ],
);

export type CouponRow = typeof coupons.$inferSelect;
export type StoreWelcomeCouponRow = typeof storeWelcomeCoupons.$inferSelect;
export type CouponRedemptionRow = typeof couponRedemptions.$inferSelect;
