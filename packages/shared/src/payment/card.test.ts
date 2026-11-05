// Contrato do Cartão (Ticket 27): o que o navegador pode mandar (só token + pagador, nunca
// número/CVV/validade), o que o Storefront recebe (só o tokenizador) e o estado público.
import { describe, expect, it } from "vitest";

import { checkoutCreateRequestSchema } from "../order/checkout.js";
import { storefrontStoreStateSchema } from "../order/storefront.js";
import {
  CARD_DECLINE_REASONS,
  CARD_PAYMENT_STATES,
  cardDeclineMessagePt,
  cardPaymentInputSchema,
  cardRetryRequestSchema,
  cardStateLabelPt,
  cardTokenizerSchema,
  cardTokenizerSdkOf,
  isCardAwaiting,
  orderCardSchema,
  payerBirthDateSchema,
  payerCpfSchema,
  payerEmailSchema,
} from "./card.js";

const CPF = "529.982.247-25";
const efiCard = {
  sdk: "efi",
  paymentToken: "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0",
  payer: { cpf: CPF, email: " Ana@Exemplo.com ", birthDate: "1990-05-17" },
  brand: "visa",
  lastFour: "4242",
};
const abacateCard = {
  sdk: "abacatepay",
  token: "ctok_abc123XYZ",
  payer: { cpf: "52998224725", email: "ana@exemplo.com" },
};

describe("pagador", () => {
  it("CPF com máscara normaliza; dígito verificador errado ou repetido é recusado", () => {
    expect(payerCpfSchema.parse(CPF)).toBe("52998224725");
    expect(payerCpfSchema.safeParse("529.982.247-24").success).toBe(false);
    expect(payerCpfSchema.safeParse("111.111.111-11").success).toBe(false);
  });

  it("e-mail aparado e minúsculo", () => {
    expect(payerEmailSchema.parse(" Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
    expect(payerEmailSchema.safeParse("ana@").success).toBe(false);
  });

  it("nascimento: data real, não futura, titular com 16+ anos", () => {
    expect(payerBirthDateSchema.safeParse("1990-05-17").success).toBe(true);
    expect(payerBirthDateSchema.safeParse("1990-02-31").success).toBe(false);
    expect(payerBirthDateSchema.safeParse("1899-12-31").success).toBe(false);
    expect(payerBirthDateSchema.safeParse(new Date().toISOString().slice(0, 10)).success).toBe(
      false,
    );
    expect(payerBirthDateSchema.safeParse("17/05/1990").success).toBe(false);
  });
});

describe("cardPaymentInputSchema", () => {
  it("Efí exige nascimento; AbacatePay não", () => {
    const efi = cardPaymentInputSchema.parse(efiCard);
    expect(efi).toMatchObject({
      sdk: "efi",
      payer: { cpf: "52998224725", email: "ana@exemplo.com" },
    });
    const payerWithoutBirth = { cpf: efiCard.payer.cpf, email: efiCard.payer.email };
    expect(cardPaymentInputSchema.safeParse({ ...efiCard, payer: payerWithoutBirth }).success).toBe(
      false,
    );
    expect(cardPaymentInputSchema.parse(abacateCard)).toMatchObject({
      sdk: "abacatepay",
      brand: null,
      lastFour: null,
    });
  });

  it("nunca aceita número, CVV ou validade (objetos estritos)", () => {
    for (const extra of [
      { number: "4242424242424242" },
      { cvv: "123" },
      { expiry: "12/30" },
      { expirationMonth: "12" },
    ]) {
      expect(cardPaymentInputSchema.safeParse({ ...abacateCard, ...extra }).success).toBe(false);
      expect(
        cardPaymentInputSchema.safeParse({ ...efiCard, payer: { ...efiCard.payer, ...extra } })
          .success,
      ).toBe(false);
    }
  });

  it("token no formato do SDK certo", () => {
    expect(cardPaymentInputSchema.safeParse({ ...abacateCard, token: "tok_123" }).success).toBe(
      false,
    );
    expect(cardPaymentInputSchema.safeParse({ ...efiCard, paymentToken: "ctok_x" }).success).toBe(
      false,
    );
    expect(cardPaymentInputSchema.safeParse({ ...abacateCard, lastFour: "42" }).success).toBe(
      false,
    );
  });

  it("nova tentativa leva attemptKey UUID", () => {
    const attemptKey = "0b8f2a4e-3c1d-4e5f-9a7b-1c2d3e4f5a6b";
    expect(cardRetryRequestSchema.safeParse({ attemptKey, card: abacateCard }).success).toBe(true);
    expect(cardRetryRequestSchema.safeParse({ attemptKey: "x", card: abacateCard }).success).toBe(
      false,
    );
  });
});

describe("checkout com Cartão", () => {
  const base = {
    lines: [
      {
        itemId: "6f1d0c0e-7d1b-4b8e-9b2a-0a1b2c3d4e5f",
        quantity: 1,
        additionalIds: [],
        complementSelections: {},
      },
    ],
    fulfillment: "pickup",
    idempotencyKey: "0b8f2a4e-3c1d-4e5f-9a7b-1c2d3e4f5a6b",
    customer: { name: "Ana", phone: "(11) 98765-4321" },
  };

  it("Crédito exige o cartão; PIX e na entrega não levam cartão", () => {
    const credit = checkoutCreateRequestSchema.safeParse({
      ...base,
      payment: { method: "credit", card: abacateCard },
    });
    expect(credit.success).toBe(true);
    expect(
      checkoutCreateRequestSchema.safeParse({ ...base, payment: { method: "credit" } }).success,
    ).toBe(false);
    expect(
      checkoutCreateRequestSchema.safeParse({
        ...base,
        payment: { method: "pix", card: abacateCard },
      }).success,
    ).toBe(false);
    const pix = checkoutCreateRequestSchema.parse({ ...base, payment: { method: "pix" } });
    expect(pix.payment.card).toBeNull();
  });
});

describe("tokenizador do Storefront", () => {
  it("só SDK + identificador público; o modo decide o SDK", () => {
    expect(cardTokenizerSdkOf("normal")).toBe("efi");
    expect(cardTokenizerSdkOf("rapido")).toBe("abacatepay");
    expect(
      cardTokenizerSchema.safeParse({
        sdk: "efi",
        payeeCode: "0123456789abcdef0123456789abcdef",
        environment: "production",
      }).success,
    ).toBe(true);
    expect(
      cardTokenizerSchema.safeParse({ sdk: "abacatepay", publicKey: "pk_live_abc", mode: "rapido" })
        .success,
    ).toBe(false);
    expect(
      cardTokenizerSchema.safeParse({ sdk: "abacatepay", publicKey: "pk_live_abc", apiKey: "x" })
        .success,
    ).toBe(false);
  });

  it("estado da Loja aceita tokenizador null ou ausente (respostas antigas)", () => {
    const shape = storefrontStoreStateSchema.shape.cardTokenizer;
    expect(shape.safeParse(undefined).success).toBe(true);
    expect(shape.safeParse(null).success).toBe(true);
    expect(shape.safeParse({ sdk: "abacatepay", publicKey: "pk_live_abc" }).success).toBe(true);
  });
});

describe("estado público do Cartão", () => {
  const approved = {
    state: "approved",
    amountCents: 5_830,
    brand: "visa",
    lastFour: "4242",
    declineReason: null,
    retryActions: [],
    tokenizer: null,
  };

  it("motivo e ações só no recusado", () => {
    expect(orderCardSchema.safeParse(approved).success).toBe(true);
    expect(
      orderCardSchema.safeParse({
        ...approved,
        state: "declined",
        declineReason: "issuer_declined",
        retryActions: ["other_card", "pix"],
      }).success,
    ).toBe(true);
    expect(orderCardSchema.safeParse({ ...approved, state: "declined" }).success).toBe(false);
    expect(orderCardSchema.safeParse({ ...approved, declineReason: "unknown" }).success).toBe(
      false,
    );
    expect(orderCardSchema.safeParse({ ...approved, retryActions: ["pix"] }).success).toBe(false);
  });

  it("rótulos, mensagens e estados que seguem consultando", () => {
    expect(CARD_PAYMENT_STATES.map(cardStateLabelPt)).toEqual([
      "Processando o pagamento",
      "Pagamento em análise",
      "Pagamento aprovado",
      "Pagamento recusado",
    ]);
    expect(CARD_PAYMENT_STATES.filter(isCardAwaiting)).toEqual(["processing", "pending"]);
    for (const reason of CARD_DECLINE_REASONS) {
      expect(cardDeclineMessagePt(reason).length).toBeGreaterThan(10);
    }
  });
});
