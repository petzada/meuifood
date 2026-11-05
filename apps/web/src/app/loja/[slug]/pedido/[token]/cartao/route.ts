// "Tentar outro cartão" (Ticket 27): valida o corpo pelo contrato (`cardRetryRequestSchema`:
// token do SDK + pagador + `attemptKey`; número/CVV/validade são recusados pelos objetos
// estritos) e repassa à api. 201 nova tentativa, 200 replay, 409/422 com o erro do contrato.
import { cardRetryRequestSchema } from "@foode/shared/payment";

import { forwardStorefrontPost } from "../../../../../../lib/storefront-proxy";
import { cardRetryResponseSchema } from "../card-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) =>
      `/storefront/lojas/${encodeURIComponent(s)}/pedidos/${encodeURIComponent(token)}/cartao`,
    contractStatuses: [409, 422],
    requestSchema: cardRetryRequestSchema,
    responseSchema: cardRetryResponseSchema,
    unavailableError: "card_retry_unavailable",
  });
}
