// Adapter de transporte do Storefront (Ticket 23, 18.2; Ticket 24a): o único lugar do `web`
// que fala com `GET /storefront/lojas/:slug/*` do servidor. Cada resposta é parseada com o
// schema de `@foode/shared` — o contrato é o schema, não um tipo redigitado aqui (20.1).
import { publicMenuSchema, storeSlugSchema, type PublicMenu } from "@foode/shared/menu";
import {
  orderAccessTokenSchema,
  orderTrackingSchema,
  storefrontStoreStateSchema,
  type OrderTracking,
  type StorefrontStoreState,
} from "@foode/shared/order";
import { cache } from "react";

import { apiFetch } from "./api";
import type { ContractSchema } from "./contract";
import { slugMovedTo } from "./slug-moved";

export type StorefrontLoad<T> =
  | { kind: "ok"; data: T }
  /** Slug inexistente ou Loja fora de `active`: "Cardápio indisponível" (spec). */
  | { kind: "not_found" }
  /** Link personalizado antigo (decisão 69): a página responde 308 para o atual. */
  | { kind: "moved"; currentSlug: string }
  | { kind: "error"; reason: string };

export type PublicMenuLoad =
  | { kind: "ok"; menu: PublicMenu }
  | { kind: "not_found" }
  | { kind: "moved"; currentSlug: string }
  | { kind: "error"; reason: string };

export type ApiFetch = typeof apiFetch;

async function loadPublic<T>(
  path: string,
  schema: ContractSchema<T>,
  fetchApi: ApiFetch,
): Promise<StorefrontLoad<T>> {
  let response: Response;
  try {
    response = await fetchApi(path, { cache: "no-store", redirect: "manual" });
  } catch {
    return { kind: "error", reason: "api_unreachable" };
  }
  if (response.status === 404) return { kind: "not_found" };
  const currentSlug = await slugMovedTo(response);
  if (currentSlug) return { kind: "moved", currentSlug };
  if (!response.ok) return { kind: "error", reason: `api_status_${response.status}` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "error", reason: "api_body_invalid" };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { kind: "error", reason: "api_contract_mismatch" };
  return { kind: "ok", data: parsed.data };
}

export async function loadPublicMenu(
  slug: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<PublicMenuLoad> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { kind: "not_found" };
  const result = await loadPublic(
    `/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/cardapio`,
    publicMenuSchema,
    fetchApi,
  );
  return result.kind === "ok" ? { kind: "ok", menu: result.data } : result;
}

/**
 * Estado da Loja + "Sobre a Loja" (24a). Enquanto a rota não existe na api (501) ou falha,
 * o Storefront segue sem a linha de estado: a api continua sendo quem recusa o Pedido fora do
 * horário ou em Pausa, na mesma escrita que o cria.
 */
export async function loadStoreState(
  slug: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<StorefrontLoad<StorefrontStoreState>> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { kind: "not_found" };
  return loadPublic(
    `/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/estado`,
    storefrontStoreStateSchema,
    fetchApi,
  );
}

/** Página do Pedido por token: 404 da api (outra Loja ou inexistente) vira `not_found`. */
export async function loadOrderTracking(
  slug: string,
  token: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<StorefrontLoad<OrderTracking>> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  const parsedToken = orderAccessTokenSchema.safeParse(token);
  if (!parsedSlug.success || !parsedToken.success) return { kind: "not_found" };
  const result = await loadPublic(
    `/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/pedidos/${encodeURIComponent(parsedToken.data)}`,
    orderTrackingSchema,
    fetchApi,
  );
  // Token de outra Loja: a api já devolve 404, mas o `web` confere de novo (nunca vaza).
  if (result.kind === "ok" && result.data.store.slug !== parsedSlug.data) {
    return { kind: "not_found" };
  }
  return result;
}

/** Uma chamada por request, compartilhada entre `generateMetadata` e a página. */
export const getPublicMenu = cache((slug: string) => loadPublicMenu(slug));
export const getStoreState = cache((slug: string) => loadStoreState(slug));
