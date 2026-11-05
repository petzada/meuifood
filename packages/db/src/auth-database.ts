// Porta do Better Auth para o D1 (Ticket 22). Fica em @foode/db porque só este pacote toca o
// D1/Drizzle (ADR 0006); apps/api passa o resultado em `betterAuth({ database })`.
// Sem `transaction: true`: o D1 não tem transação interativa (pesquisa-integracoes §1).
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

import { authSchema } from "./schema/auth";

export { AUTH_SCHEMA_OPTIONS } from "./schema/auth";

/** Adapter do Better Auth sobre o D1. Criar por request (o binding só existe no `env`). */
export function createAuthDatabase(d1: D1Database) {
  return drizzleAdapter(drizzle(d1, { schema: authSchema }), {
    provider: "sqlite",
    schema: authSchema,
  });
}

export type AuthDatabase = ReturnType<typeof createAuthDatabase>;
