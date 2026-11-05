// Tabelas do Better Auth no D1 (Ticket 22). O model `user` do Better Auth é a tabela `users` do
// Ticket 21; aqui entram `session`, `account`, `verification` e `rateLimit` (rate limit com
// storage "database": a memória do isolate não serve em Workers).
// O Drizzle adapter endereça cada model pela CHAVE do objeto `authSchema` e cada campo pela
// PROPRIEDADE JS da coluna; o nome físico segue a convenção do repositório (plural, snake_case).
// Datas em TEXT ISO-8601 UTC: o adapter converte `Date` em `toISOString()` para colunas texto.
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { stores, users, utcCheck, utcNowDefault } from "./fundacao";

function nullableUtcCheck(column: string) {
  return sql`"${sql.raw(column)}" IS NULL OR ${utcCheck(column)}`;
}

/**
 * Sessão do Better Auth. `activeStoreId` é a Loja ativa escolhida no seletor (additionalField
 * `input: false`): é só uma preferência — toda request revalida a membership no servidor.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeStoreId: text("active_store_id").references(() => stores.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_idx").on(table.userId),
    check("sessions_expires_at_utc", utcCheck("expires_at")),
    check("sessions_created_at_utc", utcCheck("created_at")),
    check("sessions_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Contas do Better Auth. Senha (hash) fica em `password` com `providerId = "credential"`. */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: text("access_token_expires_at"),
    refreshTokenExpiresAt: text("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("accounts_user_idx").on(table.userId),
    check("accounts_access_token_expires_at_utc", nullableUtcCheck("access_token_expires_at")),
    check("accounts_refresh_token_expires_at_utc", nullableUtcCheck("refresh_token_expires_at")),
    check("accounts_created_at_utc", utcCheck("created_at")),
    check("accounts_updated_at_utc", utcCheck("updated_at")),
  ],
);

/**
 * Tokens de uso único do Better Auth (definir senha do convite e reset). O consumo apaga a
 * linha; a expiração é conferida pelo Better Auth.
 */
export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
    check("verifications_expires_at_utc", utcCheck("expires_at")),
    check("verifications_created_at_utc", utcCheck("created_at")),
    check("verifications_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Janela de rate limit do Better Auth (chave = IP de `cf-connecting-ip` + caminho). */
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    /** Epoch em ms (formato do Better Auth para este campo, não ISO). */
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [
    uniqueIndex("rate_limits_key_unique").on(table.key),
    check("rate_limits_count_non_negative", sql.raw(`"count" >= 0`)),
  ],
);

/**
 * Objeto de schema do Drizzle adapter: chave = nome do model no Better Auth. Use com
 * `AUTH_SCHEMA_OPTIONS` (mesmos additionalFields e storage do rate limit).
 */
export const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  rateLimit: rateLimits,
} as const;

/**
 * Parte das opções do Better Auth que define o schema. `createAuth` (apps/api) DEVE espalhar
 * estas opções; o teste `auth-schema.test.ts` compara o schema esperado com `authSchema`.
 */
export const AUTH_SCHEMA_OPTIONS = {
  user: {
    additionalFields: {
      platformRole: { type: "string", required: false, input: false },
    },
  },
  session: {
    additionalFields: {
      activeStoreId: { type: "string", required: false, input: false },
    },
  },
  rateLimit: { storage: "database" },
} as const;

export type SessionRow = typeof sessions.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type VerificationRow = typeof verifications.$inferSelect;
export type RateLimitRow = typeof rateLimits.$inferSelect;
