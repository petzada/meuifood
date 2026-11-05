// Link personalizado antigo (decisão 69): a api responde 308 com `x-foode-current-slug` e corpo
// `{ error: "slug_moved", currentSlug }` em `/storefront/lojas/{antigo}/...`. O web chama com
// `redirect: "manual"`, detecta aqui e responde 308 para `/loja/{atual}{subcaminho}?{query}`
// (um salto só; vale para Loja suspensa). Puro: testável sem Next.
import {
  movedStorePath,
  STOREFRONT_CURRENT_SLUG_HEADER,
  storefrontSlugMovedSchema,
} from "@foode/shared/onboarding";

/** Link atual quando a resposta da api é o 308 de link antigo; null caso contrário. */
export async function slugMovedTo(response: Response): Promise<string | null> {
  if (response.status !== 308) return null;
  const payload: unknown = await response.json().catch(() => null);
  const parsed = storefrontSlugMovedSchema.safeParse(payload);
  if (parsed.success) return parsed.data.currentSlug;
  const header = response.headers.get(STOREFRONT_CURRENT_SLUG_HEADER);
  const fromHeader = storefrontSlugMovedSchema.shape.currentSlug.safeParse(header);
  return fromHeader.success ? fromHeader.data : null;
}

/** Caminho público (com query) do request, com o link atual no lugar do antigo. */
export function movedLocation(requestUrl: string, currentSlug: string): string {
  const url = new URL(requestUrl);
  return movedStorePath(`${url.pathname}${url.search}`, currentSlug);
}

/** Resposta 308 dos route handlers para o mesmo caminho com o link atual. */
export function movedResponse(requestUrl: string, currentSlug: string): Response {
  return new Response(null, {
    headers: { "cache-control": "no-store", location: movedLocation(requestUrl, currentSlug) },
    status: 308,
  });
}

/** Query string de `searchParams` da página (Next) para repassar no redirect. */
export function searchString(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  if (!searchParams) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (typeof value === "string") params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
