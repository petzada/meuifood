// "Tentar outro cartão" no navegador (Ticket 27): fala só com o route handler do `web`
// (`/loja/{slug}/pedido/{token}/cartao`), que valida o corpo pelo contrato e repassa à api pelo
// binding. O corpo é `cardRetryRequestSchema`: token de uso único + pagador + `attemptKey`.
import { cardRetryRequestSchema, type CardPaymentInputRaw } from "@foode/shared/payment";

import type { ContractSchema } from "../../../../../lib/contract";

/**
 * Resposta da api em `POST /storefront/lojas/:slug/pedidos/:token/cartao` (`CardReply` da api):
 * 201/200 com `trackingPath`; 409/422 com o erro do contrato. Até o contrato ganhar um schema
 * próprio em `@foode/shared/payment`, o espelho fica aqui (sem zod no app).
 */
export type CardRetryResponse = { ok: true; trackingPath: string } | { error: string };

export const cardRetryResponseSchema: ContractSchema<CardRetryResponse> = {
  safeParse(input) {
    if (input && typeof input === "object") {
      const data = input as Record<string, unknown>;
      if (
        data.ok === true &&
        typeof data.trackingPath === "string" &&
        data.trackingPath.startsWith("/")
      ) {
        return { success: true, data: { ok: true, trackingPath: data.trackingPath } };
      }
      if (typeof data.error === "string") return { success: true, data: { error: data.error } };
    }
    return { success: false, error: "card_retry_response_invalid" };
  },
};

export type CardRetryResult =
  { kind: "ok" } | { kind: "error"; error: string } | { kind: "unavailable" };

/** Mensagem dos erros do contrato da nova tentativa (sem texto do provedor). */
export function cardRetryErrorMessagePt(error: string): string {
  switch (error) {
    case "attempt_active":
      return "Já há um pagamento em andamento para este Pedido. Aguarde a confirmação.";
    case "order_not_payable":
      return "Este Pedido não pode mais ser pago por aqui.";
    case "payment_method_unavailable":
      return "O pagamento com cartão ficou indisponível nesta Loja. Pague com PIX ou fale com a Loja.";
    default:
      return "Não foi possível enviar o novo cartão. Tente de novo em instantes.";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export function cardRetryPath(storeSlug: string, token: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(token)}/cartao`;
}

/** Corpo antes do parse (o `card` vem do `buildCardPaymentInput`). */
export type CardRetryRequestInput = { attemptKey: string; card: CardPaymentInputRaw };

export type CardRetryApi = {
  retry(storeSlug: string, token: string, body: CardRetryRequestInput): Promise<CardRetryResult>;
};

export function createCardRetryApi(fetchImpl: FetchLike = defaultFetch): CardRetryApi {
  return {
    async retry(storeSlug, token, body) {
      const parsedBody = cardRetryRequestSchema.safeParse(body);
      if (!parsedBody.success) return { kind: "error", error: "invalid_input" };
      try {
        const response = await fetchImpl(cardRetryPath(storeSlug, token), {
          body: JSON.stringify(parsedBody.data),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const parsed = cardRetryResponseSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) return { kind: "unavailable" };
        if ("ok" in parsed.data) return { kind: "ok" };
        return { kind: "error", error: parsed.data.error };
      } catch {
        return { kind: "unavailable" };
      }
    },
  };
}
