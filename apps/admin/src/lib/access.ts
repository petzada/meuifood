// Política de acesso e navegação do Painel (Ticket 22). Puro e edge-safe: roda no
// `middleware.ts`, no layout e nos testes. A decisão de verdade continua na api (guard por
// membership); aqui só se roteia e se esconde navegação com o mesmo `can()` de @foode/shared.
//
// PONTO DE EXTENSÃO: os próximos tickets acrescentam entradas em `ROUTES` (uma linha por
// área: prefixo da URL, rótulo da navegação e permissão). O middleware, o layout e a navegação
// leem daqui; nada mais precisa mudar.
import { can, type Permission, type Role, type SessionCtx } from "@foode/shared/auth";

export type RouteRule = {
  /** Prefixo da URL (`/` casa só a raiz). */
  prefix: string;
  /** Permissão exigida; `null` = qualquer usuário autenticado com Loja ativa. */
  permission: Permission | null;
  /** Rótulo na navegação; ausente = rota sem entrada no menu. */
  label?: string;
};

export const ROUTES: readonly RouteRule[] = [
  { prefix: "/", permission: "orders.view", label: "Pedidos" },
  { prefix: "/cardapio", permission: "store.menu", label: "Cardápio" },
  { prefix: "/configuracoes", permission: "store.settings", label: "Configurações" },
  { prefix: "/equipe", permission: "store.members", label: "Equipe" },
  { prefix: "/ops", permission: "ops.area", label: "Ops" },
  { prefix: "/selecionar-loja", permission: null },
];

/** Header interno que o middleware grava com o caminho da request (layouts não veem a URL). */
export const PATHNAME_HEADER = "x-foode-pathname";

/** Rotas sem sessão: entrar, recuperar senha, definir senha (convite e reset). */
export const PUBLIC_PATHS = ["/entrar", "/esqueci-senha", "/definir-senha"] as const;

/** Rota de quem tem sessão mas nenhuma Loja (convite removido, por exemplo). */
export const NO_STORE_PATH = "/sem-acesso";

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Papel efetivo da sessão: Ops é global e vence; senão o papel na Loja ativa; `null` sem
 * Loja ativa (o usuário precisa escolher uma ou não tem nenhuma).
 */
export function resolveRole(session: SessionCtx): Role | null {
  if (session.user.platformRole === "foode_ops") return "foode_ops";
  return session.activeStore?.role ?? null;
}

/** Para onde cada papel vai ao entrar. */
export function homeFor(role: Role): string {
  return role === "foode_ops" ? "/ops" : "/";
}

export function matchRoute(pathname: string): RouteRule | undefined {
  let best: RouteRule | undefined;
  for (const rule of ROUTES) {
    const hit =
      rule.prefix === "/"
        ? pathname === "/"
        : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (hit && (!best || rule.prefix.length > best.prefix.length)) best = rule;
  }
  return best;
}

export type NavItem = { href: string; label: string };

/** Entradas da navegação visíveis para o papel (mesma política do middleware). */
export function navFor(role: Role): NavItem[] {
  return ROUTES.filter(
    (rule): rule is RouteRule & { label: string } =>
      typeof rule.label === "string" && rule.permission !== null && can(role, rule.permission),
  ).map(({ prefix, label }) => ({ href: prefix, label }));
}

function loginRedirect(pathname: string, search: string): string {
  const next = `${pathname}${search}`;
  return next === "/" ? "/entrar" : `/entrar?next=${encodeURIComponent(next)}`;
}

/** Destino seguro de `?next=`: só caminho relativo do próprio Painel. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) {
    return fallback;
  }
  return next;
}

/**
 * Decide o acesso a uma URL: `null` deixa passar; string é o destino do redirect.
 * Sem sessão → /entrar. Papel sem a permissão da rota → home do papel (sem página de erro
 * que revele a existência da área). Sem Loja ativa → seletor ou "sem acesso".
 */
export function decideAccess(
  pathname: string,
  search: string,
  session: SessionCtx | null,
): string | null {
  if (!session) return isPublicPath(pathname) ? null : loginRedirect(pathname, search);

  const role = resolveRole(session);

  if (role === null) {
    const target = session.stores.length > 0 ? "/selecionar-loja" : NO_STORE_PATH;
    return pathname === target ? null : target;
  }

  if (isPublicPath(pathname) || pathname === NO_STORE_PATH) return homeFor(role);

  const rule = matchRoute(pathname);
  if (!rule) return null;
  if (rule.permission === null) {
    return role === "foode_ops" ? homeFor(role) : null;
  }
  return can(role, rule.permission) ? null : homeFor(role);
}
