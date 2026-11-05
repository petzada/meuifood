// Atualização periódica da página do Pedido (Ticket 24a): o navegador consulta este handler a
// cada ORDER_TRACKING_POLL_INTERVAL_MS; ele lê a api pelo binding e devolve o contrato.
import { loadOrderTracking } from "../../../../../../lib/storefront";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  const result = await loadOrderTracking(slug, token);
  if (result.kind === "not_found") {
    return Response.json({ error: "order_not_found" }, { status: 404 });
  }
  if (result.kind === "error") {
    return Response.json({ error: "tracking_unavailable" }, { status: 502 });
  }
  return Response.json(result.data, { headers: { "cache-control": "no-store" } });
}
