import { orderRefInputSchema } from "@foode/shared/order";

import { painelRpc } from "../../../../lib/painel-rpc";

// Detalhe do Pedido (PED-07) para o painel lateral da fila; mesma política da lista.
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 422,
  rate_limited: 429,
};

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const input = orderRefInputSchema.safeParse(await context.params);
  if (!input.success) return Response.json({ error: "invalid_input" }, { status: 422 });
  try {
    const result = await painelRpc((api, caller) => api.ordersGet(caller, input.data));
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: STATUS[result.error] ?? 500 });
    }
    return Response.json(result.data, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
