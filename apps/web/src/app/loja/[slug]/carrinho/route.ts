// Recálculo do carrinho (Ticket 23): o navegador manda só ids e quantidades para este
// handler, que encaminha a `POST /storefront/lojas/:slug/carrinho` pelo binding `API`.
// O corpo é validado aqui com o mesmo schema da api; preço nunca vem do navegador.
import {
  cartQuoteRequestSchema,
  cartQuoteResponseSchema,
  storeSlugSchema,
} from "@foode/shared/menu";

import { apiFetch } from "../../../../lib/api";
import { movedResponse, slugMovedTo } from "../../../../lib/slug-moved";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return Response.json({ error: "store_not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const parsedBody = cartQuoteRequestSchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await apiFetch(`/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/carrinho`, {
      body: JSON.stringify(parsedBody.data),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "manual",
    });
  } catch {
    return Response.json({ error: "quote_unavailable" }, { status: 502 });
  }

  const currentSlug = await slugMovedTo(upstream);
  if (currentSlug) return movedResponse(request.url, currentSlug);

  if (upstream.status === 400 || upstream.status === 404) {
    const payload: unknown = await upstream.json().catch(() => ({ error: "invalid_input" }));
    return Response.json(payload, { status: upstream.status });
  }
  if (!upstream.ok) return Response.json({ error: "quote_unavailable" }, { status: 502 });

  const quote = cartQuoteResponseSchema.safeParse(await upstream.json().catch(() => null));
  if (!quote.success) return Response.json({ error: "quote_unavailable" }, { status: 502 });
  return Response.json(quote.data, { headers: { "cache-control": "no-store" } });
}
