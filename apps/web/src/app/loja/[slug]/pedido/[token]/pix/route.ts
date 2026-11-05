// "Pagar com PIX" depois do Cartão recusado (Ticket 27): corpo vazio
// (`orderPixSwitchRequestSchema`), resposta `orderPixSwitchResponseSchema`. 201 trocou o Pedido
// para PIX (mesmo total e tarifa; a cobrança aparece no bloco `pix` da página do Pedido), 200
// replay, 409 `attempt_active`/`order_not_payable`, 422 `payment_method_unavailable`, 404.
import { orderPixSwitchRequestSchema, orderPixSwitchResponseSchema } from "@foode/shared/payment";

import { forwardStorefrontPost } from "../../../../../../lib/storefront-proxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) =>
      `/storefront/lojas/${encodeURIComponent(s)}/pedidos/${encodeURIComponent(token)}/pix`,
    contractStatuses: [409, 422],
    requestSchema: orderPixSwitchRequestSchema,
    responseSchema: orderPixSwitchResponseSchema,
    unavailableError: "pix_switch_unavailable",
  });
}
