// "Sou eu" (P-2.1): troca o token curto de uso único pelos dados completos do último Pedido
// na mesma Loja.
import {
  phoneLookupConfirmRequestSchema,
  phoneLookupConfirmResponseSchema,
} from "@foode/shared/order";

import { forwardStorefrontPost } from "../../../../../lib/storefront-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) => `/storefront/lojas/${encodeURIComponent(s)}/clientes/confirmar`,
    requestSchema: phoneLookupConfirmRequestSchema,
    responseSchema: phoneLookupConfirmResponseSchema,
    unavailableError: "lookup_unavailable",
  });
}
