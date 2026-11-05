// Sessão do Consumidor no servidor do Storefront (Ticket 13): lê o cookie da request e pergunta
// à api pelo binding. Falha = anônimo (o Cardápio e o checkout Guest seguem). Nada do cookie
// nem da conta vai para log.
import {
  customerOrdersSchema,
  customerSessionStateSchema,
  type CustomerOrders,
  type CustomerSessionState,
} from "@foode/shared/customer";
import { storeSlugSchema } from "@foode/shared/menu";
import { headers } from "next/headers";
import { cache } from "react";

import { apiFetch } from "./api";
import type { ContractSchema } from "./contract";
import type { ApiFetch } from "./storefront";

export const ANONYMOUS_SESSION: CustomerSessionState = { state: "anonymous" };

async function loadWithCookie<T>(
  path: string,
  cookie: string,
  schema: ContractSchema<T>,
  fetchApi: ApiFetch,
): Promise<T | null> {
  if (!cookie) return null;
  try {
    const response = await fetchApi(path, {
      cache: "no-store",
      headers: { cookie },
      redirect: "manual",
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadCustomerSession(
  cookie: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<CustomerSessionState> {
  return (
    (await loadWithCookie("/storefront/conta", cookie, customerSessionStateSchema, fetchApi)) ??
    ANONYMOUS_SESSION
  );
}

export async function loadCustomerOrders(
  slug: string,
  cookie: string,
  fetchApi: ApiFetch = apiFetch,
): Promise<CustomerOrders | null> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;
  return loadWithCookie(
    `/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/conta/pedidos`,
    cookie,
    customerOrdersSchema,
    fetchApi,
  );
}

async function requestCookie(): Promise<string> {
  return (await headers()).get("cookie") ?? "";
}

/** Uma chamada por request, compartilhada entre as páginas da Loja. */
export const getCustomerSession = cache(async () => loadCustomerSession(await requestCookie()));
export const getCustomerOrders = cache(async (slug: string) =>
  loadCustomerOrders(slug, await requestCookie()),
);
