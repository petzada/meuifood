// Chamadas do checkout no navegador (Ticket 24a): sempre aos route handlers do `web`
// (`/loja/{slug}/finalizar/*`), que encaminham à api pelo binding. Toda resposta passa pelo
// schema do contrato; fora dele vira "indisponível" e a tela segue com o que tem (G7/G9).
import {
  checkoutCreateResponseSchema,
  checkoutQuoteResponseSchema,
  phoneLookupConfirmResponseSchema,
  phoneLookupResponseSchema,
  type CheckoutCreateRequestInput,
  type CheckoutCreateResponse,
  type CheckoutQuoteResponse,
  type PhoneLookupConfirmResponse,
  type PhoneLookupResponse,
} from "@foode/shared/order";

import type { ContractSchema } from "../../../../lib/contract";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export function checkoutApiPath(storeSlug: string, action: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/finalizar/${action}`;
}

async function postJson<T>(
  fetchImpl: FetchLike,
  path: string,
  body: unknown,
  schema: ContractSchema<T>,
  acceptStatuses: readonly number[] = [],
): Promise<{ kind: "ok"; data: T } | { kind: "status"; status: number } | { kind: "unavailable" }> {
  try {
    const response = await fetchImpl(path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok && !acceptStatuses.includes(response.status)) {
      return { kind: "status", status: response.status };
    }
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export type CheckoutApi = {
  confirmPhone(storeSlug: string, confirmToken: string): Promise<PhoneLookupConfirmResponse | null>;
  createOrder(
    storeSlug: string,
    body: CheckoutCreateRequestInput,
  ): Promise<CheckoutCreateResponse | null>;
  lookupPhone(
    storeSlug: string,
    body: { phone: string; turnstileToken: string },
  ): Promise<
    PhoneLookupResponse | { found: false; reason: "rate_limited" | "captcha_failed" } | null
  >;
  quote(
    storeSlug: string,
    body: Pick<CheckoutCreateRequestInput, "address" | "couponCode" | "fulfillment" | "lines">,
  ): Promise<CheckoutQuoteResponse | null>;
};

export function createCheckoutApi(fetchImpl: FetchLike = defaultFetch): CheckoutApi {
  return {
    async confirmPhone(storeSlug, confirmToken) {
      const result = await postJson(
        fetchImpl,
        checkoutApiPath(storeSlug, "confirmar"),
        { confirmToken },
        phoneLookupConfirmResponseSchema,
      );
      return result.kind === "ok" ? result.data : null;
    },
    async createOrder(storeSlug, body) {
      const result = await postJson(
        fetchImpl,
        checkoutApiPath(storeSlug, "pedido"),
        body,
        checkoutCreateResponseSchema,
        [409, 422],
      );
      return result.kind === "ok" ? result.data : null;
    },
    async lookupPhone(storeSlug, body) {
      const result = await postJson(
        fetchImpl,
        checkoutApiPath(storeSlug, "busca"),
        body,
        phoneLookupResponseSchema,
      );
      if (result.kind === "ok") return result.data;
      if (result.kind === "status" && result.status === 429) {
        return { found: false, reason: "rate_limited" };
      }
      if (result.kind === "status" && result.status === 403) {
        return { found: false, reason: "captcha_failed" };
      }
      return null;
    },
    async quote(storeSlug, body) {
      const result = await postJson(
        fetchImpl,
        checkoutApiPath(storeSlug, "cotacao"),
        body,
        checkoutQuoteResponseSchema,
      );
      return result.kind === "ok" ? result.data : null;
    },
  };
}
