// Criação idempotente do Pedido (Ticket 24a): 201 novo, 200 replay (mesma chave e corpo),
// 409/422 com o erro do contrato (`checkoutErrorHttpStatus`); carrinho e formulário ficam.
import { checkoutCreateRequestSchema, checkoutCreateResponseSchema } from "@foode/shared/order";

import { forwardStorefrontPost } from "../../../../../lib/storefront-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) => `/storefront/lojas/${encodeURIComponent(s)}/pedidos`,
    contractStatuses: [409, 422],
    requestSchema: checkoutCreateRequestSchema,
    responseSchema: checkoutCreateResponseSchema,
    unavailableError: "order_unavailable",
  });
}
