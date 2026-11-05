// Chamadas da conta do Consumidor no navegador (Ticket 13): sempre aos route handlers do `web`
// (`/conta/*`), que repassam à api com o cookie da sessão. Toda resposta passa pelo schema do
// contrato; erro do contrato volta tipado (mensagem por `customerErrorMessagePt`); fora dele
// vira "indisponível" e a tela segue (G7/G9). Telefone, código e CPF nunca vão para log.
import {
  customerCodeSentSchema,
  customerCodeVerifiedSchema,
  customerErrorSchema,
  customerOrdersSchema,
  customerSessionStateSchema,
  type CustomerCodeSent,
  type CustomerCodeVerified,
  type CustomerError,
  type CustomerOrders,
  type CustomerSessionState,
} from "@foode/shared/customer";

import type { ContractSchema } from "../../../../lib/contract";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export type AccountResult<T> =
  { kind: "ok"; data: T } | { kind: "error"; error: CustomerError } | { kind: "unavailable" };

async function call<T>(
  fetchImpl: FetchLike,
  path: string,
  init: { body?: unknown; method: "GET" | "POST" },
  schema: ContractSchema<T> | null,
): Promise<AccountResult<T>> {
  try {
    const response = await fetchImpl(path, {
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : {},
      method: init.method,
    });
    if (!response.ok) {
      const error = customerErrorSchema.safeParse(await response.json().catch(() => null));
      return error.success ? { kind: "error", error: error.data } : { kind: "unavailable" };
    }
    if (!schema) return { kind: "ok", data: null as T };
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export type AccountApi = {
  requestCode(body: {
    phone: string;
    turnstileToken: string;
  }): Promise<AccountResult<CustomerCodeSent>>;
  verifyCode(body: {
    phone: string;
    code: string;
    turnstileToken: string;
  }): Promise<AccountResult<CustomerCodeVerified>>;
  signup(body: { name: string; cpf: string }): Promise<AccountResult<CustomerSessionState>>;
  session(): Promise<AccountResult<CustomerSessionState>>;
  orders(storeSlug: string): Promise<AccountResult<CustomerOrders>>;
  signOut(): Promise<AccountResult<null>>;
};

export function createAccountApi(fetchImpl: FetchLike = defaultFetch): AccountApi {
  return {
    requestCode: (body) =>
      call(fetchImpl, "/conta/codigo", { body, method: "POST" }, customerCodeSentSchema),
    verifyCode: (body) =>
      call(
        fetchImpl,
        "/conta/codigo/verificar",
        { body, method: "POST" },
        customerCodeVerifiedSchema,
      ),
    signup: (body) =>
      call(fetchImpl, "/conta", { body, method: "POST" }, customerSessionStateSchema),
    session: () => call(fetchImpl, "/conta", { method: "GET" }, customerSessionStateSchema),
    orders: (storeSlug) =>
      call(
        fetchImpl,
        `/loja/${encodeURIComponent(storeSlug)}/conta/pedidos`,
        { method: "GET" },
        customerOrdersSchema,
      ),
    signOut: () => call(fetchImpl, "/conta/sair", { method: "POST" }, null),
  };
}
