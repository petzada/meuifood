// `middleware.ts` (edge), não `proxy.ts`: no Next 16 o proxy roda em Node, e o OpenNext
// não suporta Node Middleware (pesquisa-integracoes §5).
//
// Guarda de rota do Painel (Ticket 22): resolve a sessão na api (RPC `session` pelo
// binding `API`, cookie + IP real) e aplica a política de lib/access.ts: sem sessão →
// /entrar; Operador só Pedidos; Ops só /ops; Dono a Loja dele. Quem não tem permissão volta
// para a home do próprio papel, sem página que revele a área. A api continua sendo a
// autoridade: toda RPC confere a membership de novo.
import type { SessionCtx } from "@foode/shared/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type NextRequest, NextResponse } from "next/server";

import { decideAccess, PATHNAME_HEADER } from "./lib/access";
import { CLIENT_IP_HEADER } from "./lib/auth-proxy";

async function sessionFor(request: NextRequest): Promise<SessionCtx | null> {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) return null;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return await env.API.session({
      cookie,
      ip: request.headers.get(CLIENT_IP_HEADER)?.trim() || null,
    });
  } catch {
    // Binding ausente (next dev sem wrangler) ou api fora do ar: sem sessão.
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await sessionFor(request);
  const destination = decideAccess(pathname, search, session);
  if (destination) return NextResponse.redirect(new URL(destination, request.url));
  // Layouts não enxergam a URL: o caminho segue num header interno (sempre sobrescrito,
  // para o navegador não conseguir forjar).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Tudo menos assets e `/api/*` (health e o proxy de auth têm a própria política).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
