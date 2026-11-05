import { ordersListInputSchema } from "@foode/shared/order";
import type { NextRequest } from "next/server";

import { painelRpc } from "../../../lib/painel-rpc";

// Polling da fila (decisão 23): o navegador chama a cada 10 s com o cookie da sessão; a api
// resolve sessão, papel e Loja ativa (nunca um id vindo da query). Fora do middleware
// (`/api/*`): o erro da RPC vira o status HTTP.
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 422,
  rate_limited: 429,
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const input = ordersListInputSchema.safeParse({
    filter: params.get("filter") ?? undefined,
    scope: params.get("scope") ?? undefined,
  });
  if (!input.success) return Response.json({ error: "invalid_input" }, { status: 422 });
  try {
    const result = await painelRpc((api, caller) => api.ordersList(caller, input.data));
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: STATUS[result.error] ?? 500 });
    }
    return Response.json(result.data, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
