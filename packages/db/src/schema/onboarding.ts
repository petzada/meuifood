// Onboarding do Dono, vitrine e funil próprio (Ticket 28, migration 0005). Só expand: tabelas
// novas, nada em `stores`/`store_profiles` (ADD de CHECK obrigaria recriar a tabela). Convenções
// de fundacao.ts; limites = os de @foode/shared/onboarding (conferidos em
// apps/api/src/onboarding-contract.test.ts). Sem GLOB/LIKE longo (o D1 limita a 50 bytes).
//
// - `store_showcases` (1:1, público): descrição ≤ 160, chaves do logo/capa no R2
//   (`stores/{store_id}/brand/...`), Instagram e IDs de Pixel. Sem linha = vitrine vazia.
// - `store_onboarding` (1:1, interno): respostas de perfil (uso interno da Foode; Dono da Loja e
//   Ops leem, Storefront nunca), Slug confirmado pelo Dono e "Loja pronta" já vista.
// - `store_funnel_daily`: contadores agregados por Loja, dia civil de São Paulo e evento. Sem
//   dado pessoal (nenhum IP, telefone, cookie ou id de Consumidor).
import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";

export const STORE_DESCRIPTION_MAX = 160;
export const PROFILE_OTHER_MAX = 80;
export const STORE_CUISINES = [
  "lanches",
  "pizza",
  "japonesa",
  "brasileira",
  "marmitas",
  "doces",
  "acai",
  "saudavel",
  "bebidas",
  "other",
] as const;
export const STORE_GOALS = [
  "start_delivery",
  "leave_marketplaces",
  "organize_whatsapp",
  "sell_more",
  "other",
] as const;
export const FUNNEL_EVENTS = [
  "visit",
  "item_view",
  "add_to_cart",
  "checkout_start",
  "order",
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

function nullableUtcCheck(column: string) {
  return sql`"${sql.raw(column)}" IS NULL OR ${utcCheck(column)}`;
}

export const storeShowcases = sqliteTable(
  "store_showcases",
  {
    storeId: text("store_id")
      .primaryKey()
      .references(() => stores.id),
    description: text("description"),
    logoObjectKey: text("logo_object_key"),
    coverObjectKey: text("cover_object_key"),
    instagram: text("instagram"),
    metaPixelId: text("meta_pixel_id"),
    googleTagId: text("google_tag_id"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  () => [
    check(
      "store_showcases_description",
      sql.raw(
        `"description" IS NULL OR length("description") BETWEEN 1 AND ${STORE_DESCRIPTION_MAX}`,
      ),
    ),
    check(
      "store_showcases_logo_key",
      sql.raw(`"logo_object_key" IS NULL OR length("logo_object_key") BETWEEN 1 AND 200`),
    ),
    check(
      "store_showcases_cover_key",
      sql.raw(`"cover_object_key" IS NULL OR length("cover_object_key") BETWEEN 1 AND 200`),
    ),
    check(
      "store_showcases_instagram",
      sql.raw(
        `"instagram" IS NULL OR (length("instagram") BETWEEN 1 AND 30 AND "instagram" NOT GLOB '*[^a-z0-9._]*')`,
      ),
    ),
    check(
      "store_showcases_meta_pixel",
      sql.raw(
        `"meta_pixel_id" IS NULL OR (length("meta_pixel_id") BETWEEN 15 AND 16 AND "meta_pixel_id" NOT GLOB '*[^0-9]*')`,
      ),
    ),
    check(
      "store_showcases_google_tag",
      sql.raw(
        `"google_tag_id" IS NULL OR (length("google_tag_id") BETWEEN 6 AND 23 AND "google_tag_id" NOT GLOB '*[^A-Z0-9-]*')`,
      ),
    ),
    check("store_showcases_created_at_utc", utcCheck("created_at")),
    check("store_showcases_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const storeOnboarding = sqliteTable(
  "store_onboarding",
  {
    storeId: text("store_id")
      .primaryKey()
      .references(() => stores.id),
    profileCuisine: text("profile_cuisine", { enum: STORE_CUISINES }),
    profileCuisineOther: text("profile_cuisine_other"),
    profileGoal: text("profile_goal", { enum: STORE_GOALS }),
    profileGoalOther: text("profile_goal_other"),
    profileAnsweredAt: text("profile_answered_at"),
    profileAnsweredByUserId: text("profile_answered_by_user_id").references(() => users.id),
    slugConfirmedAt: text("slug_confirmed_at"),
    readyAcknowledgedAt: text("ready_acknowledged_at"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  () => [
    check(
      "store_onboarding_cuisine",
      sql.raw(`"profile_cuisine" IS NULL OR ${inList("profile_cuisine", STORE_CUISINES)}`),
    ),
    check(
      "store_onboarding_goal",
      sql.raw(`"profile_goal" IS NULL OR ${inList("profile_goal", STORE_GOALS)}`),
    ),
    // Respondido = as duas respostas, quando e quem; nada pela metade.
    check(
      "store_onboarding_profile_complete",
      sql.raw(
        `("profile_cuisine" IS NULL AND "profile_goal" IS NULL AND "profile_answered_at" IS NULL AND "profile_answered_by_user_id" IS NULL) OR ("profile_cuisine" IS NOT NULL AND "profile_goal" IS NOT NULL AND "profile_answered_at" IS NOT NULL AND "profile_answered_by_user_id" IS NOT NULL)`,
      ),
    ),
    // "Outro" exige o texto; opção fechada não guarda texto.
    check(
      "store_onboarding_cuisine_other",
      sql.raw(
        `("profile_cuisine" IS 'other') = ("profile_cuisine_other" IS NOT NULL) AND ("profile_cuisine_other" IS NULL OR length("profile_cuisine_other") BETWEEN 1 AND ${PROFILE_OTHER_MAX})`,
      ),
    ),
    check(
      "store_onboarding_goal_other",
      sql.raw(
        `("profile_goal" IS 'other') = ("profile_goal_other" IS NOT NULL) AND ("profile_goal_other" IS NULL OR length("profile_goal_other") BETWEEN 1 AND ${PROFILE_OTHER_MAX})`,
      ),
    ),
    check("store_onboarding_answered_at_utc", nullableUtcCheck("profile_answered_at")),
    check("store_onboarding_slug_confirmed_at_utc", nullableUtcCheck("slug_confirmed_at")),
    check("store_onboarding_ready_at_utc", nullableUtcCheck("ready_acknowledged_at")),
    check("store_onboarding_created_at_utc", utcCheck("created_at")),
    check("store_onboarding_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const storeFunnelDaily = sqliteTable(
  "store_funnel_daily",
  {
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** Dia civil `YYYY-MM-DD` em America/Sao_Paulo. */
    day: text("day").notNull(),
    event: text("event", { enum: FUNNEL_EVENTS }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.day, table.event] }),
    check("store_funnel_daily_day", sql.raw(`date("day") IS "day"`)),
    check("store_funnel_daily_event", sql.raw(inList("event", FUNNEL_EVENTS))),
    check("store_funnel_daily_count", sql.raw(`"count" >= 0`)),
    check("store_funnel_daily_updated_at_utc", utcCheck("updated_at")),
  ],
);

export type StoreShowcaseRow = typeof storeShowcases.$inferSelect;
export type StoreOnboardingRow = typeof storeOnboarding.$inferSelect;
export type StoreFunnelDailyRow = typeof storeFunnelDaily.$inferSelect;
