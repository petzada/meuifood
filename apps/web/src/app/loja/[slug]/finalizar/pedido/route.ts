// Criação idempotente do Pedido (Ticket 24a): 201 novo, 200 replay (mesma chave e corpo),
// 409/422 com o erro do contrato (`checkoutErrorHttpStatus`); carrinho e formulário ficam.
// 422 `account_cpf_unavailable` (Cartão com o CPF da conta sem sessão, decisão 65) passa
// normalizado para o navegador voltar ao CPF digitável.
import { checkoutCreateRequestSchema } from "@foode/shared/order";

import { forwardStorefrontPost } from "../../../../../lib/storefront-proxy";
import { checkoutCreateResultSchema } from "../checkout-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) => `/storefront/lojas/${encodeURIComponent(s)}/pedidos`,
    contractStatuses: [409, 422],
    requestSchema: checkoutCreateRequestSchema,
    responseSchema: checkoutCreateResultSchema,
    unavailableError: "order_unavailable",
  });
}
