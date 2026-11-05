// Adapter de transporte do Storefront (Ticket 23, 18.2): o único lugar do `web` que fala
// com `GET /storefront/lojas/:slug/cardapio`. Parseia a resposta com `publicMenuSchema` —
// o contrato é o schema de `@foode/shared`, não um tipo redigitado aqui (20.1).
import { publicMenuSchema, storeSlugSchema, type PublicMenu } from "@foode/shared/menu";
import { cache } from "react";

import { apiFetch } from "./api";

export type PublicMenuLoad =
  | { kind: "ok"; menu: PublicMenu }
  /** Slug inexistente ou Loja fora de `active`: "Cardápio indisponível" (spec). */
  | { kind: "not_found" }
  | { kind: "error"; reason: string };

export type ApiFetch = typeof apiFetch;

export async function loadPublicMenu(
  slug: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<PublicMenuLoad> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { kind: "not_found" };

  let response: Response;
  try {
    response = await fetchApi(`/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/cardapio`, {
      cache: "no-store",
    });
  } catch {
    return { kind: "error", reason: "api_unreachable" };
  }
  if (response.status === 404) return { kind: "not_found" };
  if (!response.ok) return { kind: "error", reason: `api_status_${response.status}` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "error", reason: "api_body_invalid" };
  }
  const menu = publicMenuSchema.safeParse(payload);
  if (!menu.success) return { kind: "error", reason: "api_contract_mismatch" };
  return { kind: "ok", menu: menu.data };
}

/** Uma chamada por request, compartilhada entre `generateMetadata` e a página. */
export const getPublicMenu = cache((slug: string) => loadPublicMenu(slug));
