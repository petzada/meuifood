// Funil próprio (Ticket 28, P-REL-4): o navegador manda só `{ event }` (sendBeacon/fetch) e
// este handler encaminha a `POST /storefront/lojas/:slug/eventos` pelo binding `API`, com o
// IP em `cf-connecting-ip` só para o rate limit da api (nunca gravado). 204 sempre que a api
// contou; qualquer outra falha também é silenciosa para o navegador.
import { storeSlugSchema } from "@foode/shared/menu";
import { funnelEventRequestSchema } from "@foode/shared/onboarding";

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
  const parsedBody = funnelEventRequestSchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  const headers: Record<string, string> = { "content-type": "application/json" };
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers["cf-connecting-ip"] = clientIp;

  let upstream: Response;
  try {
    upstream = await apiFetch(`/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/eventos`, {
      body: JSON.stringify(parsedBody.data),
      headers,
      method: "POST",
      redirect: "manual",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  const currentSlug = await slugMovedTo(upstream);
  if (currentSlug) return movedResponse(request.url, currentSlug);
  if (upstream.status === 404 || upstream.status === 429) {
    return new Response(null, { status: upstream.status });
  }
  return new Response(null, { status: upstream.ok ? 204 : 502 });
}
