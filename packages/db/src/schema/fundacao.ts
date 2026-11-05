// Schema base do D1 (Ticket 21). Convenções — AGENTS.md §Banco (D1):
// - datas em TEXT ISO-8601 UTC com milissegundos (`2026-11-04T12:00:00.000Z`), conferidas por CHECK;
// - enums como TEXT + CHECK (o SQLite não tem tipo enum);
// - dinheiro em centavos inteiros (INTEGER, sufixo `_cents`, CHECK >= 0);
// - ids TEXT (UUID gerado no Worker com crypto.randomUUID()).
// Schema partido por domínio em src/schema/*.ts (índice em src/schema/index.ts).
// Toda mudança aqui vira migration por `pnpm db:generate` (drizzle-kit) e é aplicada por
// `wrangler d1 migrations` (CI efêmero e workflow db-migrate).
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const STORE_STATUSES = ["onboarding", "active", "suspended"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "operator"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const PLATFORM_ROLES = ["foode_ops"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Default de coluna de data: agora, em ISO-8601 UTC com milissegundos. */
export const utcNowDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/**
 * CHECK que exige o formato ISO-8601 UTC com milissegundos: o valor tem de sobreviver intacto à
 * normalização do `strftime` (data inválida vira NULL e `IS` falha). Sem GLOB: o D1 limita padrões
 * LIKE/GLOB a 50 bytes ("LIKE or GLOB pattern too complex").
 */
export function utcCheck(column: string) {
  return sql.raw(`strftime('%Y-%m-%dT%H:%M:%fZ', "${column}") IS "${column}"`);
}

export function inList(column: string, values: readonly string[]) {
  return `"${column}" IN (${values.map((value) => `'${value}'`).join(", ")})`;
}

/**
 * Usuários do Painel (Ops, Dono, Operador). Colunas compatíveis com o model `user` do Better Auth
 * (Ticket 22 mapeia o model para esta tabela). `platform_role` guarda o papel global `foode_ops`.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    platformRole: text("platform_role", { enum: PLATFORM_ROLES }),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    check("users_email_lowercase", sql.raw(`"email" = lower("email") AND "email" LIKE '%_@_%'`)),
    check("users_email_verified_bool", sql.raw(`"email_verified" IN (0, 1)`)),
    check(
      "users_platform_role",
      sql.raw(`"platform_role" IS NULL OR ${inList("platform_role", PLATFORM_ROLES)}`),
    ),
    check("users_created_at_utc", utcCheck("created_at")),
    check("users_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Loja: tenant do app. O Slug é global (um só namespace para o Storefront). */
export const stores = sqliteTable(
  "stores",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: STORE_STATUSES }).notNull().default("onboarding"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("stores_slug_unique").on(table.slug),
    check(
      "stores_slug_format",
      sql.raw(
        `length("slug") BETWEEN 3 AND 63 AND "slug" NOT GLOB '*[^a-z0-9-]*' AND "slug" NOT GLOB '-*' AND "slug" NOT GLOB '*-'`,
      ),
    ),
    check("stores_name_not_blank", sql.raw(`length(trim("name")) > 0`)),
    check("stores_status", sql.raw(inList("status", STORE_STATUSES))),
    check("stores_created_at_utc", utcCheck("created_at")),
    check("stores_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Membership: um usuário pode pertencer a várias Lojas, com um papel por Loja. */
export const storeMemberships = sqliteTable(
  "store_memberships",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: MEMBERSHIP_ROLES }).notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("store_memberships_store_user_unique").on(table.storeId, table.userId),
    index("store_memberships_user_idx").on(table.userId),
    check("store_memberships_role", sql.raw(inList("role", MEMBERSHIP_ROLES))),
    check("store_memberships_created_at_utc", utcCheck("created_at")),
  ],
);

/** Trilha de auditoria: quem, quando, o quê (Ops e Painel). Só recebe INSERT. */
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    occurredAt: text("occurred_at").notNull().default(utcNowDefault),
    actorUserId: text("actor_user_id").references(() => users.id),
    storeId: text("store_id").references(() => stores.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: text("metadata").notNull().default("{}"),
  },
  (table) => [
    index("audit_events_store_idx").on(table.storeId, table.occurredAt),
    check("audit_events_action_not_blank", sql.raw(`length(trim("action")) > 0`)),
    check("audit_events_metadata_json", sql.raw(`json_valid("metadata")`)),
    check("audit_events_occurred_at_utc", utcCheck("occurred_at")),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type StoreRow = typeof stores.$inferSelect;
export type StoreMembershipRow = typeof storeMemberships.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
