// Guard de RBAC (Ticket 22): o único ponto que transforma sessão em papel + contexto do banco.
// Usado no Hono (requireRole/requirePermission) e nas RPCs do PainelApi (authorize).
// A política vem do módulo único `can()`/ROLE_PERMISSIONS (@foode/shared/auth, achado 19.5);
// papel e Loja saem SEMPRE do banco (membership e `platform_role`), revalidados a cada request.
import type { FoodeDb, OpsContext, StoreContext } from "@foode/db";
import {
  type ActiveStore,
  can,
  type Permission,
  type Role,
  roleSchema,
  type SessionCtx,
} from "@foode/shared/auth";
import type { MiddlewareHandler } from "hono";

import type { Env } from "../env";
import type { AuthSession, FoodeAuth } from "./auth";

/** Resultado da autorização: o contexto emitido por @foode/db, nunca um id do request. */
export type Authorized =
  | { kind: "store"; session: SessionCtx; store: StoreContext }
  | { kind: "ops"; session: SessionCtx; ops: OpsContext };

export type GuardVariables = { auth: FoodeAuth; db: FoodeDb; authorized: Authorized };

export type AuthorizeResult =
  { ok: true; authorized: Authorized } | { ok: false; error: "unauthenticated" | "forbidden" };

/** Papéis que têm a permissão, segundo a política única. */
export function rolesWith(permission: Permission): Role[] {
  return roleSchema.options.filter((role) => can(role, permission));
}

/**
 * Resolve a sessão a cada request: Better Auth → usuário → Lojas da membership → Loja ativa
 * revalidada. Membership removida = Loja ativa some na hora. Loja ativa gravada que não está
 * mais na membership NÃO cai para outra Loja (evita operar a Loja errada sem perceber); sem
 * Loja gravada e com uma só membership, ela é a ativa. Retorna null sem sessão válida.
 */
export async function resolveSessionCtx(
  auth: FoodeAuth,
  db: FoodeDb,
  headers: Headers,
): Promise<SessionCtx | null> {
  const session = await auth.getSession(headers);
  return session ? sessionCtxOf(db, session) : null;
}

/** Monta o SessionCtx de uma sessão do Better Auth já lida nesta request. */
export async function sessionCtxOf(db: FoodeDb, session: AuthSession): Promise<SessionCtx> {
  const [rows, ops] = await Promise.all([
    db.access.storesOfUser(session.userId),
    db.access.opsContext(session.userId),
  ]);
  const stores: ActiveStore[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    role: row.role,
  }));
  const activeStore = session.activeStoreId
    ? (stores.find((store) => store.id === session.activeStoreId) ?? null)
    : stores.length === 1
      ? stores[0]!
      : null;

  return {
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      platformRole: ops ? "foode_ops" : null,
    },
    sessionExpiresAt: session.expiresAt,
    activeStore,
    stores,
  };
}

/**
 * Autoriza a request para um dos papéis. `foode_ops` exige `platform_role` no banco
 * (`db.access.opsContext`) e emite OpsContext; `owner`/`operator` exigem membership na Loja
 * ATIVA com um desses papéis (`db.access.storeContext`) e emitem StoreContext. Sem sessão →
 * `unauthenticated`; papel errado ou Loja de outro usuário → `forbidden`, sem efeito persistido.
 */
export async function authorize(
  auth: FoodeAuth,
  db: FoodeDb,
  headers: Headers,
  roles: readonly Role[],
): Promise<AuthorizeResult> {
  const session = await resolveSessionCtx(auth, db, headers);
  if (!session) return { ok: false, error: "unauthenticated" };
  return authorizeSession(db, session, roles);
}

/** Mesma decisão de `authorize` para uma sessão já resolvida nesta request. */
export async function authorizeSession(
  db: FoodeDb,
  session: SessionCtx,
  roles: readonly Role[],
): Promise<AuthorizeResult> {
  if (roles.includes("foode_ops") && session.user.platformRole === "foode_ops") {
    const ops = await db.access.opsContext(session.user.id);
    if (ops) return { ok: true, authorized: { kind: "ops", session, ops } };
  }

  const active = session.activeStore;
  if (active && roles.includes(active.role)) {
    const store = await db.access.storeContext({ userId: session.user.id, storeId: active.id });
    if (store && roles.includes(store.role)) {
      return { ok: true, authorized: { kind: "store", session, store } };
    }
  }
  return { ok: false, error: "forbidden" };
}

/** Autoriza pela permissão da política única (`can()`), não por lista de papéis solta. */
export function authorizePermission(
  auth: FoodeAuth,
  db: FoodeDb,
  headers: Headers,
  permission: Permission,
): Promise<AuthorizeResult> {
  return authorize(auth, db, headers, rolesWith(permission));
}

type GuardEnv = { Bindings: Env; Variables: GuardVariables };

/**
 * Middleware Hono sobre `authorize`: 401 sem sessão, 403 sem papel, senão
 * `c.set("authorized")`. Espera `auth` e `db` já postos no contexto por um middleware anterior.
 */
export function requireRole(...roles: [Role, ...Role[]]): MiddlewareHandler<GuardEnv> {
  return async (c, next) => {
    const result = await authorize(c.var.auth, c.var.db, c.req.raw.headers, roles);
    if (!result.ok) {
      return c.json({ error: result.error }, result.error === "unauthenticated" ? 401 : 403);
    }
    c.set("authorized", result.authorized);
    await next();
  };
}

export function requirePermission(permission: Permission): MiddlewareHandler<GuardEnv> {
  const roles = rolesWith(permission);
  const [first, ...rest] = roles;
  if (!first) throw new Error(`nenhum papel tem a permissão ${permission}`);
  return requireRole(first, ...rest);
}
