// Sessão do Painel no servidor (RSC, layouts e server actions): resolvida pela api via
// RPC `session(caller)`, uma vez por request (React `cache`). O admin nunca decide papel
// ou Loja por conta própria: lê o `SessionCtx` que a api montou da membership.
import type { PainelCaller } from "@foode/shared";
import type { Permission, Role, SessionCtx } from "@foode/shared/auth";
import { can } from "@foode/shared/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { homeFor, resolveRole } from "./access";
import { CLIENT_IP_HEADER } from "./auth-proxy";
import { painelApi } from "./painel-api";

/** Quem chama a RPC: cookie do navegador e IP real da borda. */
export async function painelCaller(): Promise<PainelCaller> {
  const requestHeaders = await headers();
  return {
    cookie: requestHeaders.get("cookie") ?? "",
    ip: requestHeaders.get(CLIENT_IP_HEADER)?.trim() || null,
  };
}

export const getSession = cache(async (): Promise<SessionCtx | null> => {
  const caller = await painelCaller();
  if (!caller.cookie) return null;
  try {
    return await (await painelApi()).session(caller);
  } catch {
    // Binding ausente (dev sem wrangler) ou api fora: trata como sem sessão.
    return null;
  }
});

export type PainelSession = SessionCtx & { role: Role };

/** Sessão com papel resolvido; redireciona quando não há (o middleware já cobre, defesa em profundidade). */
export async function requireSession(): Promise<PainelSession> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const role = resolveRole(session);
  if (!role) redirect(session.stores.length > 0 ? "/selecionar-loja" : "/sem-acesso");
  return { ...session, role };
}

/**
 * PONTO DE EXTENSÃO: toda página nova do Painel abre com
 * `const session = await requirePermission("store.menu")`.
 */
export async function requirePermission(permission: Permission): Promise<PainelSession> {
  const session = await requireSession();
  if (!can(session.role, permission)) redirect(homeFor(session.role));
  return session;
}
