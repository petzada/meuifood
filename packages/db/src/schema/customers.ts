// Conta do Consumidor (Ticket 13, migration 0006; decisões 65, 66, 68). Só expand: tabelas novas.
// Convenções de fundacao.ts; limites = os de @foode/shared/customer (conferidos em
// apps/api/src/customer-contract.test.ts). Sem GLOB/LIKE longo (o D1 limita a 50 bytes).
//
// - `customer_accounts`: conta ÚNICA na Foode (não é de Loja). Um telefone = uma conta e um CPF =
//   uma conta (UNIQUE). Guarda só nome, telefone E.164 e CPF (sem endereços: P-3.4 revogado na 64).
//   Separada de `users` (Dono/Operador/Ops, Better Auth): o Consumidor nunca vira membro.
// - `customer_login_codes`: código de 4 dígitos do WhatsApp. Sem telefone nem código em claro:
//   `phone_key` = HMAC do telefone e `code_hash` = HMAC do código (chave do servidor; 4 dígitos
//   sem chave seriam quebrados offline). Validade 5 min, 5 tentativas, uso único (`consumed_at`).
//   O código que vale é sempre o mais recente do telefone; o reenvio (30 s) olha esse também.
// - `customer_sessions`: sessão do Consumidor (cookie httpOnly no domínio do Storefront), separada
//   das `sessions` do Better Auth. `token_hash` = SHA-256 do token. `account_id` NULL = telefone
//   verificado aguardando nome + CPF (cadastro do 1º acesso, sessão curta).
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { utcCheck, utcNowDefault } from "./fundacao";

export const CUSTOMER_NAME_MAX = 120;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

function hexHashCheck(column: string) {
  return sql.raw(`length("${column}") = 64 AND lower("${column}") = "${column}"`);
}

function digitsCheck(column: string, length: number) {
  return sql.raw(`length("${column}") = ${length} AND "${column}" NOT GLOB '*[^0-9]*'`);
}

export const customerAccounts = sqliteTable(
  "customer_accounts",
  {
    id: text("id").primaryKey(),
    /** E.164 sem "+" (`55DD9XXXXXXXX`), o telefone verificado pelo código. */
    phoneE164: text("phone_e164").notNull(),
    /** CPF só com os 11 dígitos, dígito verificador conferido na api. */
    cpf: text("cpf").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    uniqueIndex("customer_accounts_phone_unique").on(table.phoneE164),
    uniqueIndex("customer_accounts_cpf_unique").on(table.cpf),
    check("customer_accounts_phone", digitsCheck("phone_e164", 13)),
    check("customer_accounts_cpf", digitsCheck("cpf", 11)),
    check(
      "customer_accounts_name",
      sql.raw(`length(trim("name")) BETWEEN 1 AND ${CUSTOMER_NAME_MAX}`),
    ),
    check("customer_accounts_created_at_utc", utcCheck("created_at")),
    check("customer_accounts_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const customerLoginCodes = sqliteTable(
  "customer_login_codes",
  {
    id: text("id").primaryKey(),
    phoneKey: text("phone_key").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
  },
  (table) => [
    index("customer_login_codes_phone_idx").on(table.phoneKey, table.createdAt),
    check("customer_login_codes_phone_key", hexHashCheck("phone_key")),
    check("customer_login_codes_code_hash", hexHashCheck("code_hash")),
    check(
      "customer_login_codes_attempts",
      sql.raw(`"attempts" BETWEEN 0 AND ${LOGIN_CODE_MAX_ATTEMPTS}`),
    ),
    check("customer_login_codes_window", sql.raw(`"expires_at" > "created_at"`)),
    check("customer_login_codes_created_at_utc", utcCheck("created_at")),
    check("customer_login_codes_expires_at_utc", utcCheck("expires_at")),
    check(
      "customer_login_codes_consumed_at_utc",
      sql`"consumed_at" IS NULL OR ${utcCheck("consumed_at")}`,
    ),
  ],
);

export const customerSessions = sqliteTable(
  "customer_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    accountId: text("account_id").references(() => customerAccounts.id),
    /** Telefone verificado pelo código (base do cadastro quando ainda não há conta). */
    phoneE164: text("phone_e164").notNull(),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("customer_sessions_token_unique").on(table.tokenHash),
    index("customer_sessions_account_idx").on(table.accountId),
    check("customer_sessions_token_hash", hexHashCheck("token_hash")),
    check("customer_sessions_phone", digitsCheck("phone_e164", 13)),
    check("customer_sessions_window", sql.raw(`"expires_at" > "created_at"`)),
    check("customer_sessions_created_at_utc", utcCheck("created_at")),
    check("customer_sessions_expires_at_utc", utcCheck("expires_at")),
  ],
);

export type CustomerAccountRow = typeof customerAccounts.$inferSelect;
export type CustomerLoginCodeRow = typeof customerLoginCodes.$inferSelect;
export type CustomerSessionRow = typeof customerSessions.$inferSelect;
