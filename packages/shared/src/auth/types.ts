// Tipos de sessão e RBAC do Painel (Ticket 22). A api monta estes valores a partir do banco
// (membership e `platform_role`); o admin só os lê para navegação e telas.
import type { MembershipRole, PlatformRole, Role, StoreStatus } from "./schemas.js";

/** Loja que o usuário pode operar, com o papel dele nela. */
export type ActiveStore = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  role: MembershipRole;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole | null;
};

/**
 * Sessão resolvida no servidor a cada request. `activeStore` é a Loja ativa já revalidada
 * contra a membership (null se não há Loja ou a membership sumiu); `stores` alimenta o seletor.
 */
export type SessionCtx = {
  user: SessionUser;
  sessionExpiresAt: string;
  activeStore: ActiveStore | null;
  stores: ActiveStore[];
};

/** Capacidades que a política única conhece (achado 19.5). */
export type Permission =
  | "ops.area"
  | "store.settings"
  | "store.members"
  | "store.menu"
  | "store.pause"
  | "orders.view"
  | "orders.update_status"
  | "orders.cancel";

export type AuthErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_input"
  | "captcha_failed"
  | "rate_limited"
  | "not_found"
  | "conflict"
  | "not_implemented";

/** Resultado das RPCs de Auth/membership: erro de negócio vira código, nunca exceção. */
export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: AuthErrorCode };

export type { Role };
