// Ações do Cartão recusado no navegador (Ticket 27): falam só com os route handlers do `web`
// (`/loja/{slug}/pedido/{token}/cartao` e `/pix`), que validam pelo contrato e repassam à api
// pelo binding. "Tentar outro cartão" leva `cardRetryRequestSchema` (token de uso único + pagador
// + `attemptKey`); "Pagar com PIX" leva corpo vazio (`orderPixSwitchRequestSchema`) e, em
// sucesso, a página do Pedido recarrega o estado e mostra o bloco do PIX (Ticket 26).
import {
  cardRetryRequestSchema,
  cardRetryResponseSchema,
  orderPixSwitchRequestSchema,
  orderPixSwitchResponseSchema,
  type CardPaymentActionError,
  type CardPaymentInputRaw,
} from "@foode/shared/payment";

export type CardActionResult =
  { kind: "ok" } | { kind: "error"; error: CardPaymentActionError } | { kind: "unavailable" };

/** Mensagem dos erros do contrato (`CARD_PAYMENT_ACTION_ERRORS`), sem texto do provedor. */
export function cardRetryErrorMessagePt(error: CardPaymentActionError): string {
  switch (error) {
    case "attempt_active":
      return "Já há um pagamento em andamento para este Pedido. Aguarde a confirmação.";
    case "order_not_payable":
      return "Este Pedido não pode mais ser pago por aqui.";
    case "payment_method_unavailable":
      return "O pagamento com cartão ficou indisponível nesta Loja. Pague com PIX ou fale com a Loja.";
    case "account_cpf_unavailable":
      return "Não encontramos o CPF da sua conta. Digite o CPF do titular do cartão.";
    case "order_not_found":
    case "invalid_input":
      return "Não foi possível enviar o novo cartão. Tente de novo em instantes.";
  }
}

/** Mensagem dos erros de "Pagar com PIX" depois da recusa. */
export function pixSwitchErrorMessagePt(error: CardPaymentActionError): string {
  switch (error) {
    case "attempt_active":
      return "Já há um pagamento em andamento para este Pedido. Aguarde a confirmação.";
    case "order_not_payable":
      return "Este Pedido não pode mais ser pago por aqui.";
    case "payment_method_unavailable":
      return "O PIX ficou indisponível nesta Loja agora. Tente outro cartão ou fale com a Loja.";
    case "account_cpf_unavailable":
    case "order_not_found":
    case "invalid_input":
      return "Não foi possível trocar para PIX. Tente de novo em instantes.";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function orderActionPath(storeSlug: string, token: string, action: "cartao" | "pix"): string {
  return `/loja/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(token)}/${action}`;
}

export function cardRetryPath(storeSlug: string, token: string): string {
  return orderActionPath(storeSlug, token, "cartao");
}

export function pixSwitchPath(storeSlug: string, token: string): string {
  return orderActionPath(storeSlug, token, "pix");
}

/** Corpo antes do parse (o `card` vem do `buildCardPaymentInput`). */
export type CardRetryRequestInput = { attemptKey: string; card: CardPaymentInputRaw };

export type CardRetryApi = {
  retry(storeSlug: string, token: string, body: CardRetryRequestInput): Promise<CardActionResult>;
  /** "Pagar com PIX" depois do recusado: 201 trocou, 200 replay (mesma cobrança). */
  payWithPix(storeSlug: string, token: string): Promise<CardActionResult>;
};

async function postAction(
  fetchImpl: FetchLike,
  path: string,
  body: unknown,
  responseSchema: {
    safeParse(
      input: unknown,
    ):
      | { success: true; data: { ok: true } | { error: CardPaymentActionError } }
      | { success: false };
  },
): Promise<CardActionResult> {
  try {
    const response = await fetchImpl(path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { kind: "unavailable" };
    if ("ok" in parsed.data) return { kind: "ok" };
    return { kind: "error", error: parsed.data.error };
  } catch {
    return { kind: "unavailable" };
  }
}

export function createCardRetryApi(fetchImpl: FetchLike = defaultFetch): CardRetryApi {
  return {
    async retry(storeSlug, token, body) {
      const parsedBody = cardRetryRequestSchema.safeParse(body);
      if (!parsedBody.success) return { kind: "error", error: "invalid_input" };
      return postAction(
        fetchImpl,
        cardRetryPath(storeSlug, token),
        parsedBody.data,
        cardRetryResponseSchema,
      );
    },
    async payWithPix(storeSlug, token) {
      return postAction(
        fetchImpl,
        pixSwitchPath(storeSlug, token),
        orderPixSwitchRequestSchema.parse({}),
        orderPixSwitchResponseSchema,
      );
    },
  };
}
