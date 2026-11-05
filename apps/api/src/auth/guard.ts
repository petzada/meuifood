// Guard de RBAC (Ticket 22): o único ponto que transforma sessão em papel + contexto do banco.
// Contrato; a fatia API implementa. Usado no Hono do PainelApi e nas RPCs.
import type { FoodeDb, OpsContext, StoreContext } from "@foode/db";
import type { Role, SessionCtx } from "@foode/shared/auth";
import type { MiddlewareHandler } from "hono";

import type { Env } from "../env";
import type { FoodeAuth } from "./auth";
import { NotImplementedError } from "./not-implemented";

/** Resultado da autorização: o contexto emitido por @foode/db, nunca um id do request. */
export type Authorized =
  | { kind: "store"; session: SessionCtx; store: StoreContext }
  | { kind: "ops"; session: SessionCtx; ops: OpsContext };

export type GuardVariables = { auth: FoodeAuth; db: FoodeDb; authorized: Authorized };

/**
 * Resolve a sessão a cada request: Better Auth → usuário → Lojas da membership → Loja ativa
 * revalidada (`db.access.storeContext`); membership removida = Loja ativa some na hora.
 * Retorna null sem sessão válida.
 */
export async function resolveSessionCtx(
  auth: FoodeAuth,
  db: FoodeDb,
  headers: Headers,
): Promise<SessionCtx | null> {
  void auth;
  void db;
  void headers;
  throw new NotImplementedError("resolveSessionCtx");
}

/**
 * Autoriza a request para um dos papéis. `foode_ops` exige `platform_role` no banco
 * (`db.access.opsContext`) e emite OpsContext; `owner`/`operator` exigem membership na Loja
 * ATIVA com um desses papéis e emitem StoreContext. Sem sessão → `unauthenticated`; papel
 * errado ou Loja de outro usuário → `forbidden`, sem nenhum efeito persistido.
 */
export async function authorize(
  auth: FoodeAuth,
  db: FoodeDb,
  headers: Headers,
  roles: readonly Role[],
): Promise<
  { ok: true; authorized: Authorized } | { ok: false; error: "unauthenticated" | "forbidden" }
> {
  void auth;
  void db;
  void headers;
  void roles;
  throw new NotImplementedError("authorize");
}

/**
 * Middleware Hono sobre `authorize`: 401 sem sessão, 403 sem papel, senão `c.set("authorized")`.
 * Enquanto o Ticket 22 não implementa, responde 501.
 */
export function requireRole(
  ...roles: [Role, ...Role[]]
): MiddlewareHandler<{ Bindings: Env; Variables: GuardVariables }> {
  void roles;
  return async (c) => c.json({ error: "not_implemented" }, 501);
}
