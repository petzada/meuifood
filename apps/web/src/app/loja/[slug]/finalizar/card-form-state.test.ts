// Regras puras do formulário de Cartão (Ticket 27): máscaras, bandeira, Luhn, validade,
// campos por SDK, validação e o corpo do contrato sem número/CVV/validade.
import { cardPaymentInputSchema } from "@foode/shared/payment";
import { describe, expect, it } from "vitest";

import {
  accountCpfAvailable,
  buildCardPaymentInput,
  cardFieldsFor,
  describeCard,
  detectCardBrand,
  emptyCardForm,
  firstCardError,
  initialCardForm,
  formatCardCvvInput,
  formatCardExpiryInput,
  formatCardNumberInput,
  formatCpfInput,
  luhnValid,
  parseCardExpiry,
  validateCardForm,
} from "./card-form-state";

const NOW = new Date("2026-11-05T15:00:00.000Z");

const valid = {
  ...emptyCardForm,
  birthDate: "1990-05-10",
  cpf: "529.982.247-25",
  cvv: "123",
  email: "Maria@Exemplo.com",
  expiry: "12/30",
  holderName: "MARIA SOUZA",
  number: "4242 4242 4242 4242",
};

describe("máscaras e bandeira", () => {
  it("formata número por bandeira, validade MM/AA, CVV e CPF", () => {
    expect(formatCardNumberInput("4242424242424242999")).toBe("4242 4242 4242 4242");
    expect(formatCardNumberInput("371449635398431")).toBe("3714 496353 98431");
    expect(formatCardExpiryInput("5")).toBe("05");
    expect(formatCardExpiryInput("1")).toBe("1");
    expect(formatCardExpiryInput("1230")).toBe("12/30");
    expect(formatCardCvvInput("12345", "visa")).toBe("123");
    expect(formatCardCvvInput("12345", "amex")).toBe("1234");
    expect(formatCpfInput("52998224725")).toBe("529.982.247-25");
  });

  it("detecta a bandeira pelo prefixo", () => {
    expect(detectCardBrand("4242")).toBe("visa");
    expect(detectCardBrand("5555")).toBe("mastercard");
    expect(detectCardBrand("3714")).toBe("amex");
    expect(detectCardBrand("6362 97")).toBe("elo");
    expect(detectCardBrand("6062 82")).toBe("hipercard");
    expect(detectCardBrand("9")).toBeNull();
  });

  it("Luhn e validade (mês corrente ainda vale)", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    expect(parseCardExpiry("11/26", NOW)).toEqual({ month: "11", year: "2026" });
    expect(parseCardExpiry("10/26", NOW)).toBeNull();
    expect(parseCardExpiry("13/30", NOW)).toBeNull();
  });
});

describe("campos por SDK e validação", () => {
  it("Efí pede cartão + CPF + e-mail + nascimento; AbacatePay só CPF + e-mail", () => {
    expect(cardFieldsFor("efi")).toContain("number");
    expect(cardFieldsFor("efi")).toContain("birthDate");
    expect(cardFieldsFor("abacatepay")).toEqual(["cpf", "email"]);
  });

  it("formulário válido passa nos dois SDKs", () => {
    expect(validateCardForm(valid, "efi", NOW)).toEqual({});
    expect(
      validateCardForm({ ...emptyCardForm, cpf: valid.cpf, email: valid.email }, "abacatepay", NOW),
    ).toEqual({});
  });

  it("mensagens por campo: número, vencido, CVV, CPF inválido, e-mail, nascimento", () => {
    const errors = validateCardForm(
      {
        ...valid,
        birthDate: "2020-01-01",
        cpf: "111.111.111-11",
        cvv: "12",
        email: "x",
        expiry: "10/26",
        number: "4242 4242 4242 4241",
      },
      "efi",
      NOW,
    );
    expect(errors.number).toBe("Confira o número do cartão.");
    expect(errors.expiry).toBe("Este cartão está vencido.");
    expect(errors.cvv).toMatch(/código de segurança/u);
    expect(errors.cpf).toBe("Confira o CPF: o número não é válido.");
    expect(errors.email).toMatch(/Confira o e-mail/u);
    expect(errors.birthDate).toBe("Confira a data de nascimento.");
    expect(firstCardError(errors)).toBe("number");
    // Na AbacatePay o cartão fica no iframe: só CPF/e-mail contam.
    expect(
      Object.keys(validateCardForm({ ...valid, number: "", cvv: "" }, "abacatepay", NOW)),
    ).toEqual([]);
  });
});

describe("corpo do contrato", () => {
  it("leva só token + pagador (+ nascimento na Efí) e passa no schema estrito", () => {
    const efi = buildCardPaymentInput(
      "efi",
      { brand: "visa", lastFour: "4242", token: "tok".repeat(8) },
      valid,
    );
    expect(efi).toEqual({
      brand: "visa",
      lastFour: "4242",
      payer: { birthDate: "1990-05-10", cpf: "52998224725", email: "maria@exemplo.com" },
      paymentToken: "tok".repeat(8),
      sdk: "efi",
    });
    expect(cardPaymentInputSchema.safeParse(efi).success).toBe(true);
    const serialized = JSON.stringify(efi);
    expect(serialized).not.toContain("4242 4242");
    expect(serialized).not.toContain("123");
    expect(serialized).not.toContain("12/30");

    const abacate = buildCardPaymentInput(
      "abacatepay",
      { brand: null, lastFour: null, token: "ctok_abc123" },
      valid,
    );
    expect(abacate).toEqual({
      brand: null,
      lastFour: null,
      payer: { cpf: "52998224725", email: "maria@exemplo.com" },
      sdk: "abacatepay",
      token: "ctok_abc123",
    });
    expect(cardPaymentInputSchema.safeParse(abacate).success).toBe(true);
    expect("birthDate" in abacate.payer).toBe(false);
  });

  it("CPF da conta (decisão 65): só na Efí; o corpo leva useAccountCpf e nenhum cpf", () => {
    expect(accountCpfAvailable("efi", "***.456.789-**")).toBe(true);
    expect(accountCpfAvailable("efi", "")).toBe(false);
    expect(accountCpfAvailable("efi", null)).toBe(false);
    // AbacatePay tokeniza com o CPF no iframe: o da conta não serve.
    expect(accountCpfAvailable("abacatepay", "***.456.789-**")).toBe(false);
    expect(initialCardForm("efi", "***.456.789-**").useAccountCpf).toBe(true);
    expect(initialCardForm("abacatepay", "***.456.789-**").useAccountCpf).toBe(false);
    expect(initialCardForm(null, "***.456.789-**")).toEqual(emptyCardForm);

    const values = { ...valid, cpf: "", useAccountCpf: true };
    expect(validateCardForm(values, "efi", NOW)).toEqual({});
    const efi = buildCardPaymentInput(
      "efi",
      { brand: "visa", lastFour: "4242", token: "tok".repeat(8) },
      values,
    );
    expect(efi).toEqual({
      brand: "visa",
      lastFour: "4242",
      payer: { birthDate: "1990-05-10", email: "maria@exemplo.com", useAccountCpf: true },
      paymentToken: "tok".repeat(8),
      sdk: "efi",
    });
    expect(cardPaymentInputSchema.safeParse(efi).success).toBe(true);
    expect("cpf" in efi.payer).toBe(false);
    // "Usar outro CPF" sem digitar volta a exigir o campo.
    expect(validateCardForm({ ...values, useAccountCpf: false }, "efi", NOW).cpf).toBe(
      "Informe o CPF do titular.",
    );
  });

  it("descreve o cartão para exibir", () => {
    expect(describeCard("visa", "4242")).toBe("Visa final 4242");
    expect(describeCard(null, null)).toBe("Cartão");
  });
});
