// Tabelas da área Ops (Ticket 29; decisões 60, 61 e 62; ADR 0007). Só expand: tabelas novas,
// nada em `stores` (ADD de CHECK obrigaria recriar a tabela). Convenções de fundacao.ts:
// datas ISO-8601 UTC conferidas por `utcCheck`, enums TEXT + CHECK, dinheiro em centavos
// (`_cents`), percentuais em basis points (`_bps`, 349 = 3,49%), ids UUID gerados no Worker.
//
// Vigência meio-aberta [valid_from, valid_to): `valid_to` NULL = sem fim. Encerrar = gravar
// `valid_to`; valores nunca são reescritos (histórico). A não-sobreposição por chave é regra
// da api (`findFeeOverlap`/`periodsOverlap` de @foode/shared/ops) — o SQLite não tem
// exclusion constraint. Os enums repetem os de @foode/shared/ops (o teste de contrato da api
// confere que batem).
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";

export const CARD_MODES = ["normal", "rapido"] as const;
export type CardMode = (typeof CARD_MODES)[number];

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;
export const BILLING_CYCLES = ["monthly", "annual"] as const;
export const FEE_PAYMENT_METHODS = ["pix", "credit"] as const;
export const PAYMENT_PROVIDERS = ["abacatepay", "efi"] as const;
export const PROVIDER_OPERATIONS = ["pix_charge", "card_charge", "pix_payout"] as const;

function nullableUtcCheck(column: string) {
  return sql`"${sql.raw(column)}" IS NULL OR ${utcCheck(column)}`;
}

/** `valid_to` (se houver) depois de `valid_from`; ISO UTC de mesmo formato compara como texto. */
const periodCheck = sql.raw(`"valid_to" IS NULL OR "valid_to" > "valid_from"`);

/**
 * Cadastro da Loja feito pelo Ops (1:1 com `stores`): CNPJ, WhatsApp, endereço, conta de
 * repasse e modo do cartão. Loja sem linha aqui = cadastro anterior ao Ticket 29.
 * `card_mode` NULL = Crédito indisponível até o Ops configurar.
 */
export const storeProfiles = sqliteTable(
  "store_profiles",
  {
    storeId: text("store_id")
      .primaryKey()
      .references(() => stores.id),
    cnpj: text("cnpj").notNull(),
    whatsapp: text("whatsapp").notNull(),
    addressPostalCode: text("address_postal_code").notNull(),
    addressStreet: text("address_street").notNull(),
    addressNumber: text("address_number").notNull(),
    addressComplement: text("address_complement"),
    addressDistrict: text("address_district").notNull(),
    addressCity: text("address_city").notNull(),
    addressState: text("address_state").notNull(),
    payoutPixKeyType: text("payout_pix_key_type", { enum: PIX_KEY_TYPES }).notNull(),
    payoutPixKey: text("payout_pix_key").notNull(),
    payoutHolderName: text("payout_holder_name").notNull(),
    payoutHolderDocument: text("payout_holder_document").notNull(),
    cardMode: text("card_mode", { enum: CARD_MODES }),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    index("store_profiles_cnpj_idx").on(table.cnpj),
    check("store_profiles_cnpj_length", sql.raw(`length("cnpj") = 14`)),
    check("store_profiles_whatsapp_length", sql.raw(`length("whatsapp") = 13`)),
    check("store_profiles_postal_code_length", sql.raw(`length("address_postal_code") = 8`)),
    check("store_profiles_state_length", sql.raw(`length("address_state") = 2`)),
    check("store_profiles_pix_key_type", sql.raw(inList("payout_pix_key_type", PIX_KEY_TYPES))),
    check("store_profiles_pix_key_not_blank", sql.raw(`length(trim("payout_pix_key")) > 0`)),
    check(
      "store_profiles_holder_name_not_blank",
      sql.raw(`length(trim("payout_holder_name")) > 0`),
    ),
    check(
      "store_profiles_holder_document_length",
      sql.raw(`length("payout_holder_document") IN (11, 14)`),
    ),
    check(
      "store_profiles_card_mode",
      sql.raw(`"card_mode" IS NULL OR ${inList("card_mode", CARD_MODES)}`),
    ),
    check("store_profiles_created_at_utc", utcCheck("created_at")),
    check("store_profiles_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Plano da Loja (mensal/anual) com vigência; o novo encerra o anterior. Cobrança fora do app. */
export const storePlans = sqliteTable(
  "store_plans",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    cycle: text("cycle", { enum: BILLING_CYCLES }).notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    createdByUserId: text("created_by_user_id").references(() => users.id),
  },
  (table) => [
    index("store_plans_store_idx").on(table.storeId, table.validFrom),
    check("store_plans_cycle", sql.raw(inList("cycle", BILLING_CYCLES))),
    check("store_plans_period", periodCheck),
    check("store_plans_valid_from_utc", utcCheck("valid_from")),
    check("store_plans_valid_to_utc", nullableUtcCheck("valid_to")),
    check("store_plans_created_at_utc", utcCheck("created_at")),
  ],
);

/**
 * Tabela de faixas (decisão 61), global e com vigência: cada publicação grava as faixas
 * mensais + a linha anual com o mesmo `valid_from`. Anual = Pedidos ilimitados (0..NULL),
 * `price_cents` do ano inteiro.
 */
export const planPriceTiers = sqliteTable(
  "plan_price_tiers",
  {
    id: text("id").primaryKey(),
    cycle: text("cycle", { enum: BILLING_CYCLES }).notNull(),
    minOrders: integer("min_orders").notNull(),
    maxOrders: integer("max_orders"),
    priceCents: integer("price_cents").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    createdByUserId: text("created_by_user_id").references(() => users.id),
  },
  (table) => [
    index("plan_price_tiers_valid_from_idx").on(table.validFrom, table.cycle, table.minOrders),
    check("plan_price_tiers_cycle", sql.raw(inList("cycle", BILLING_CYCLES))),
    check("plan_price_tiers_min_orders", sql.raw(`"min_orders" >= 0`)),
    check(
      "plan_price_tiers_max_orders",
      sql.raw(`"max_orders" IS NULL OR "max_orders" >= "min_orders"`),
    ),
    check(
      "plan_price_tiers_annual_unlimited",
      sql.raw(`"cycle" <> 'annual' OR ("min_orders" = 0 AND "max_orders" IS NULL)`),
    ),
    check("plan_price_tiers_price_cents", sql.raw(`"price_cents" >= 0`)),
    check("plan_price_tiers_period", periodCheck),
    check("plan_price_tiers_valid_from_utc", utcCheck("valid_from")),
    check("plan_price_tiers_valid_to_utc", nullableUtcCheck("valid_to")),
    check("plan_price_tiers_created_at_utc", utcCheck("created_at")),
  ],
);

/**
 * Taxa Foode por meio/modo: `store_id` NULL = tabela padrão; preenchido = override da Loja.
 * Nasce vazia (decisão 61): meio sem taxa vigente fica fora do checkout.
 */
export const paymentFees = sqliteTable(
  "payment_fees",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").references(() => stores.id),
    method: text("method", { enum: FEE_PAYMENT_METHODS }).notNull(),
    cardMode: text("card_mode", { enum: CARD_MODES }),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    createdByUserId: text("created_by_user_id").references(() => users.id),
  },
  (table) => [
    index("payment_fees_lookup_idx").on(
      table.storeId,
      table.method,
      table.cardMode,
      table.validFrom,
    ),
    check("payment_fees_method", sql.raw(inList("method", FEE_PAYMENT_METHODS))),
    check(
      "payment_fees_card_mode",
      sql.raw(
        `("method" = 'credit' AND ${inList("card_mode", CARD_MODES)}) OR ("method" = 'pix' AND "card_mode" IS NULL)`,
      ),
    ),
    check("payment_fees_percent_bps", sql.raw(`"percent_bps" BETWEEN 0 AND 10000`)),
    check("payment_fees_fixed_cents", sql.raw(`"fixed_cents" >= 0`)),
    check("payment_fees_period", periodCheck),
    check("payment_fees_valid_from_utc", utcCheck("valid_from")),
    check("payment_fees_valid_to_utc", nullableUtcCheck("valid_to")),
    check("payment_fees_created_at_utc", utcCheck("created_at")),
  ],
);

/** Custos dos provedores para a Foode (Ops-only; nunca exibidos ao lojista), com vigência. */
export const providerCosts = sqliteTable(
  "provider_costs",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    operation: text("operation", { enum: PROVIDER_OPERATIONS }).notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    createdByUserId: text("created_by_user_id").references(() => users.id),
  },
  (table) => [
    index("provider_costs_lookup_idx").on(table.provider, table.operation, table.validFrom),
    check("provider_costs_provider", sql.raw(inList("provider", PAYMENT_PROVIDERS))),
    check("provider_costs_operation", sql.raw(inList("operation", PROVIDER_OPERATIONS))),
    check(
      "provider_costs_efi_no_pix_charge",
      sql.raw(`NOT ("provider" = 'efi' AND "operation" = 'pix_charge')`),
    ),
    check("provider_costs_percent_bps", sql.raw(`"percent_bps" BETWEEN 0 AND 10000`)),
    check("provider_costs_fixed_cents", sql.raw(`"fixed_cents" >= 0`)),
    check("provider_costs_period", periodCheck),
    check("provider_costs_valid_from_utc", utcCheck("valid_from")),
    check("provider_costs_valid_to_utc", nullableUtcCheck("valid_to")),
    check("provider_costs_created_at_utc", utcCheck("created_at")),
  ],
);

export type StoreProfileRow = typeof storeProfiles.$inferSelect;
export type StorePlanRow = typeof storePlans.$inferSelect;
export type PlanPriceTierRow = typeof planPriceTiers.$inferSelect;
export type PaymentFeeRow = typeof paymentFees.$inferSelect;
export type ProviderCostRow = typeof providerCosts.$inferSelect;
