// Busca de dados pelo telefone (P-2.1): resposta mascarada; 403 `captcha_failed` e 429
// `rate_limited` passam como vieram. O IP segue em `cf-connecting-ip` para o rate limit.
import { phoneLookupRequestSchema, phoneLookupResponseSchema } from "@foode/shared/order";

import { forwardStorefrontPost } from "../../../../../lib/storefront-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forwardStorefrontPost(request, slug, {
    apiPath: (s) => `/storefront/lojas/${encodeURIComponent(s)}/clientes/busca`,
    passthroughStatuses: [400, 403, 404, 429],
    requestSchema: phoneLookupRequestSchema,
    responseSchema: phoneLookupResponseSchema,
    unavailableError: "lookup_unavailable",
  });
}
