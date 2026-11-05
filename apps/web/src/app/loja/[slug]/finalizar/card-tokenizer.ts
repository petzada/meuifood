// SDKs de tokenização no navegador (Ticket 27, decisão 60). O script oficial do provedor é
// carregado sob demanda, só quando o Consumidor escolhe Cartão, e nunca copiado para o repositório.
// - Efí (`payment-token-efi`, UMD): o formulário é nosso; número/CVV/validade vão só para
//   `EfiPay.CreditCard…getPaymentToken()`, que devolve o `payment_token`.
// - AbacatePay (`abacatepay.js`): campos hospedados no iframe do provedor; `tokenize()` devolve
//   o `ctok_`. Nos dois casos o nosso servidor recebe só o token + dados do pagador.
// Só a api do provedor vê os dados do cartão; nada aqui loga ou guarda número/CVV.
import type { CardPaymentBrand, CardTokenizer } from "@foode/shared/payment";

import type { CardTokenized } from "./card-form-state";

export const EFI_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/npm/payment-token-efi/dist/payment-token-efi-umd.min.js";
export const ABACATEPAY_SCRIPT_SRC = "https://assets.abacatepay.com/cdn/abacatepay.js";

export type CardSdkErrorCode =
  "load_failed" | "card_invalid" | "payer_invalid" | "authentication_failed" | "unknown";

export class CardSdkError extends Error {
  constructor(readonly code: CardSdkErrorCode) {
    super(cardSdkErrorMessagePt(code));
    this.name = "CardSdkError";
  }
}

/** Mensagem para a pessoa, sem nome do provedor nem detalhe técnico. */
export function cardSdkErrorMessagePt(code: CardSdkErrorCode): string {
  switch (code) {
    case "load_failed":
      return "Não foi possível carregar o pagamento com cartão. Recarregue a página ou pague com PIX.";
    case "card_invalid":
      return "Confira os dados do cartão.";
    case "payer_invalid":
      return "Confira o CPF e o e-mail do titular.";
    case "authentication_failed":
      return "O banco não confirmou a autenticação do cartão. Tente de novo ou use outro cartão.";
    case "unknown":
      return "Não foi possível confirmar o cartão. Tente de novo em instantes.";
  }
}

export function toCardSdkError(error: unknown): CardSdkError {
  return error instanceof CardSdkError ? error : new CardSdkError("unknown");
}

/** Dados do cartão digitados no nosso formulário (Efí); existem só até a tokenização. */
export type CardFieldsInput = {
  number: string;
  cvv: string;
  expirationMonth: string;
  expirationYear: string;
  holderName: string;
  holderDocument: string;
};

export type CardPayerInput = { name: string; email: string; cpf: string };

export type HostedCardFields = {
  tokenize(payer: CardPayerInput): Promise<CardTokenized>;
  destroy(): void;
};

/**
 * - `fields`: os campos são nossos e o SDK só tokeniza (Efí);
 * - `hosted`: o SDK monta os campos num elemento nosso e tokeniza o que está no iframe (AbacatePay).
 */
export type CardSdkClient =
  | {
      kind: "fields";
      /** Baixa o script assim que o Cartão é escolhido (falha silenciosa; o envio tenta de novo). */
      preload?(): Promise<void>;
      tokenize(input: CardFieldsInput): Promise<CardTokenized>;
    }
  | { kind: "hosted"; mount(host: HTMLElement, amountCents: number): Promise<HostedCardFields> };

export type CardSdkFactory = (tokenizer: CardTokenizer) => CardSdkClient;

// ---- Carregamento dos scripts (uma vez por página).

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new CardSdkError("load_failed"));
  }
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptPromises.delete(src);
      reject(new CardSdkError("load_failed"));
    };
    document.head.append(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

// ---- Efí.

type EfiCreditCard = {
  setAccount(payeeCode: string): EfiCreditCard;
  setEnvironment(environment: "production" | "sandbox"): EfiCreditCard;
  setCardNumber(number: string): EfiCreditCard;
  verifyCardBrand(): Promise<string>;
  setCreditCardData(data: {
    brand: string;
    number: string;
    cvv: string;
    expirationMonth: string;
    expirationYear: string;
    holderName?: string;
    holderDocument?: string;
    reuse?: boolean;
  }): EfiCreditCard;
  getPaymentToken(): Promise<{ payment_token?: unknown; card_mask?: unknown }>;
};

type AbacateCheckout = {
  mount(target: string | HTMLElement): Promise<void>;
  tokenize(customer: {
    name: string;
    email: string;
    taxId: string;
  }): Promise<{ token?: unknown; brand?: unknown; last4?: unknown } | null | undefined>;
  destroy(): void;
};

declare global {
  interface Window {
    EfiPay?: { CreditCard: EfiCreditCard };
    AbacatePay?: {
      create(options: { publicKey: string; amount: number; locale?: "pt" }): AbacateCheckout;
    };
  }
}

const EFI_BRANDS: readonly CardPaymentBrand[] = ["visa", "mastercard", "elo", "amex", "hipercard"];

function asBrand(value: unknown): CardPaymentBrand | null {
  return typeof value === "string" && (EFI_BRANDS as readonly string[]).includes(value)
    ? (value as CardPaymentBrand)
    : null;
}

function lastFourOf(number: string): string | null {
  const digits = number.replace(/\D/gu, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function efiClient(tokenizer: Extract<CardTokenizer, { sdk: "efi" }>): CardSdkClient {
  return {
    kind: "fields",
    preload: () => loadScript(EFI_SCRIPT_SRC),
    async tokenize(input) {
      await loadScript(EFI_SCRIPT_SRC);
      const lib = window.EfiPay?.CreditCard;
      if (!lib) throw new CardSdkError("load_failed");
      let brand: CardPaymentBrand | null = null;
      try {
        brand = asBrand(await lib.setCardNumber(input.number).verifyCardBrand());
      } catch {
        brand = null;
      }
      if (!brand) throw new CardSdkError("card_invalid");
      let result: Awaited<ReturnType<EfiCreditCard["getPaymentToken"]>>;
      try {
        result = await lib
          .setAccount(tokenizer.payeeCode)
          .setEnvironment(tokenizer.environment)
          .setCreditCardData({
            brand,
            number: input.number,
            cvv: input.cvv,
            expirationMonth: input.expirationMonth,
            expirationYear: input.expirationYear,
            holderName: input.holderName,
            holderDocument: input.holderDocument,
            reuse: false,
          })
          .getPaymentToken();
      } catch {
        throw new CardSdkError("card_invalid");
      }
      const token = result?.payment_token;
      if (typeof token !== "string" || token.length === 0) throw new CardSdkError("unknown");
      return { brand, lastFour: lastFourOf(input.number), token };
    },
  };
}

// ---- AbacatePay.

function abacatePayClient(tokenizer: Extract<CardTokenizer, { sdk: "abacatepay" }>): CardSdkClient {
  return {
    kind: "hosted",
    async mount(host, amountCents) {
      await loadScript(ABACATEPAY_SCRIPT_SRC);
      const lib = window.AbacatePay;
      if (!lib) throw new CardSdkError("load_failed");
      let checkout: AbacateCheckout;
      try {
        checkout = lib.create({
          amount: amountCents,
          locale: "pt",
          publicKey: tokenizer.publicKey,
        });
        await checkout.mount(host);
      } catch {
        throw new CardSdkError("load_failed");
      }
      return {
        destroy() {
          try {
            checkout.destroy();
          } catch {
            // já desmontado
          }
        },
        async tokenize(payer) {
          let result: Awaited<ReturnType<AbacateCheckout["tokenize"]>>;
          try {
            result = await checkout.tokenize({
              email: payer.email,
              name: payer.name,
              taxId: payer.cpf,
            });
          } catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            if (code === "PAYER_INVALID") throw new CardSdkError("payer_invalid");
            if (code === "THREE_DS_FAILED") throw new CardSdkError("authentication_failed");
            if (code === "CARD_INCOMPLETE" || code === "CARD_INVALID") {
              throw new CardSdkError("card_invalid");
            }
            throw new CardSdkError("unknown");
          }
          const token = result?.token;
          if (typeof token !== "string" || !token.startsWith("ctok_")) {
            throw new CardSdkError("unknown");
          }
          const last4 = result?.last4;
          return {
            brand: asBrand(result?.brand),
            lastFour: typeof last4 === "string" && /^\d{4}$/u.test(last4) ? last4 : null,
            token,
          };
        },
      };
    },
  };
}

/** Cliente do SDK conforme o `cardTokenizer` do estado da Loja (o Storefront não escolhe). */
export function createCardSdk(tokenizer: CardTokenizer): CardSdkClient {
  switch (tokenizer.sdk) {
    case "efi":
      return efiClient(tokenizer);
    case "abacatepay":
      return abacatePayClient(tokenizer);
  }
}
