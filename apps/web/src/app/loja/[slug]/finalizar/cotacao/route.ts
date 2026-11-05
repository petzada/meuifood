// Cotação do checkout (Ticket 24a): totais, mínimo, tempo e meios recalculados no servidor.
import { checkoutQuoteRequestSchema, checkoutQuoteResponseSchema } from "@foode/shared/order";

import { forwardStorefrontPost } from "../../../../../lib/storefront-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) => `/storefront/lojas/${encodeURIComponent(s)}/checkout/cotacao`,
    requestSchema: checkoutQuoteRequestSchema,
    responseSchema: checkoutQuoteResponseSchema,
    unavailableError: "quote_unavailable",
  });
}
