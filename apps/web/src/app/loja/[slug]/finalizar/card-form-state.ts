// Regras puras do formulário de Cartão (Ticket 27, critério 20.2: regra separada da
// apresentação): máscaras, bandeira pelo prefixo, Luhn, validade, dados do pagador por SDK e o
// corpo do contrato. Sem React e sem a lib do provedor. Número, validade e CVV existem só na
// memória do navegador até a tokenização: nunca entram no corpo, no `localStorage` nem em log.
import {
  payerBirthDateSchema,
  payerCpfSchema,
  payerEmailSchema,
  type CardPaymentBrand,
  type CardPaymentInputRaw,
  type CardTokenizerSdk,
} from "@foode/shared/payment";

export type CardFormValues = {
  /** Só na Efí (campos próprios); na AbacatePay os dados ficam no iframe do provedor. */
  number: string;
  holderName: string;
  /** `MM/AA`. */
  expiry: string;
  cvv: string;
  cpf: string;
  /**
   * CPF da conta do Consumidor (decisão 65): o servidor usa o da sessão e o navegador nunca vê o
   * número inteiro. Só com `accountCpfAvailable(...)`; "Usar outro CPF" volta ao digitado.
   */
  useAccountCpf: boolean;
  email: string;
  /** `YYYY-MM-DD` (input type="date"); só na Efí. */
  birthDate: string;
};

export const emptyCardForm: CardFormValues = {
  birthDate: "",
  cpf: "",
  cvv: "",
  email: "",
  expiry: "",
  holderName: "",
  number: "",
  useAccountCpf: false,
};

/** Campos digitáveis do formulário (o `useAccountCpf` é um estado, não um campo). */
export type CardField = Exclude<keyof CardFormValues, "useAccountCpf">;

/**
 * O CPF da conta só serve quando o SDK não precisa do número no navegador: na Efí o
 * `holderDocument` é opcional; na AbacatePay o `taxId` vai ao iframe do provedor na tokenização.
 */
export function accountCpfAvailable(
  sdk: CardTokenizerSdk,
  cpfMasked: string | null | undefined,
): boolean {
  return sdk === "efi" && typeof cpfMasked === "string" && cpfMasked.trim().length > 0;
}

/** Formulário inicial: CPF da conta pré-escolhido quando disponível (decisão 65). */
export function initialCardForm(
  sdk: CardTokenizerSdk | null | undefined,
  cpfMasked: string | null | undefined,
): CardFormValues {
  return { ...emptyCardForm, useAccountCpf: !!sdk && accountCpfAvailable(sdk, cpfMasked) };
}

/** Ordem visual (foco na primeira pendência). */
export const CARD_FIELDS: readonly CardField[] = [
  "number",
  "holderName",
  "expiry",
  "cvv",
  "cpf",
  "email",
  "birthDate",
];

/** Campos que cada SDK pede na tela (os do cartão em si só quando o formulário é nosso). */
export function cardFieldsFor(sdk: CardTokenizerSdk): readonly CardField[] {
  switch (sdk) {
    case "efi":
      return CARD_FIELDS;
    case "abacatepay":
      return ["cpf", "email"];
  }
}

export const cardDigits = (value: string): string => value.replace(/\D/gu, "");

// BINs Elo (prefixos públicos) antes de Visa/Mastercard porque começam com 4/5/6.
const ELO_PREFIX =
  /^(4011(78|79)|43(1274|8935)|45(1416|7393|763[12])|50(4175|6699|67[0-8][0-9]|9[0-9]{3})|627780|63(6297|6368|6369)|65(0(0(3[1-3]|3[5-9]|4[0-9]|5[01])|4(0[5-9]|[1-3][0-9]|8[5-9]|9[0-9])|5([0-2][0-9]|3[0-8]|4[1-9]|[5-8][0-9]|9[0-8])|7(0[0-9]|1[0-8]|2[0-7])|9(0[1-9]|[1-6][0-9]|7[0-8]))|16(5[2-9]|[6-7][0-9])|50(0[0-9]|1[0-9]|2[1-9]|[3-4][0-9]|5[0-8])))/u;

/** Bandeira pelo prefixo, para a tela reagir enquanto digita (o provedor confirma ao tokenizar). */
export function detectCardBrand(number: string): CardPaymentBrand | null {
  const digits = cardDigits(number);
  if (digits.length < 2) return null;
  if (ELO_PREFIX.test(digits)) return "elo";
  if (/^(606282|3841)/u.test(digits)) return "hipercard";
  if (/^3[47]/u.test(digits)) return "amex";
  if (/^3(0[0-5]|[68])/u.test(digits)) return "diners";
  if (/^4/u.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6][0-9]|7[01]|720))/u.test(digits)) return "mastercard";
  return null;
}

function numberLengthFor(brand: CardPaymentBrand | null): number {
  if (brand === "amex") return 15;
  if (brand === "diners") return 14;
  return 16;
}

/** Amex: 4-6-5 (15 dígitos); Diners: 4-6-4 (14); demais: 4-4-4-4 (16). */
export function formatCardNumberInput(value: string): string {
  const brand = detectCardBrand(value);
  const digits = cardDigits(value).slice(0, numberLengthFor(brand));
  if (brand === "amex" || brand === "diners") {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)].filter(Boolean).join(" ");
  }
  return digits.match(/.{1,4}/gu)?.join(" ") ?? "";
}

/** `MM/AA` progressivo: "5" vira "05"; "1" espera o segundo dígito (10–12). */
export function formatCardExpiryInput(value: string): string {
  let digits = cardDigits(value).slice(0, 4);
  if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`;
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function cvvLengthFor(brand: CardPaymentBrand | null): number {
  return brand === "amex" ? 4 : 3;
}

export function formatCardCvvInput(value: string, brand: CardPaymentBrand | null): string {
  return cardDigits(value).slice(0, cvvLengthFor(brand));
}

/** "123.456.789-09" a partir de qualquer digitação. */
export function formatCpfInput(value: string): string {
  const d = cardDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function luhnValid(number: string): boolean {
  const digits = cardDigits(number);
  if (digits.length < 13) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export type CardExpiry = { month: string; year: string };

/** `MM/AA` → `{ month: "MM", year: "20AA" }` quando válida e não vencida; senão `null`. */
export function parseCardExpiry(value: string, now: Date = new Date()): CardExpiry | null {
  const digits = cardDigits(value);
  if (digits.length !== 4) return null;
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2, 4));
  if (month < 1 || month > 12) return null;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) return null;
  if (year > currentYear + 30) return null;
  return { month: String(month).padStart(2, "0"), year: String(year) };
}

export type CardFormErrors = Partial<Record<CardField, string>>;

export const CARD_FORM_MESSAGES = {
  number: "Informe o número do cartão.",
  numberInvalid: "Confira o número do cartão.",
  holderName: "Informe o nome como está no cartão.",
  expiry: "Informe a validade como MM/AA.",
  expired: "Este cartão está vencido.",
  cvv: "Informe o código de segurança (atrás do cartão).",
  cpf: "Informe o CPF do titular.",
  cpfInvalid: "Confira o CPF: o número não é válido.",
  email: "Informe seu e-mail para o recibo.",
  emailInvalid: "Confira o e-mail, como nome@exemplo.com.",
  birthDate: "Informe a data de nascimento do titular.",
  birthDateInvalid: "Confira a data de nascimento.",
} as const;

/** Validação no navegador (mensagens acessíveis); o servidor valida de novo pelo contrato. */
export function validateCardForm(
  values: CardFormValues,
  sdk: CardTokenizerSdk,
  now: Date = new Date(),
): CardFormErrors {
  const errors: CardFormErrors = {};
  const fields = cardFieldsFor(sdk);

  if (fields.includes("number")) {
    const number = cardDigits(values.number);
    const brand = detectCardBrand(number);
    if (number.length === 0) errors.number = CARD_FORM_MESSAGES.number;
    else if (number.length !== numberLengthFor(brand) || !luhnValid(number)) {
      errors.number = CARD_FORM_MESSAGES.numberInvalid;
    }
    if (values.holderName.trim().length < 2) errors.holderName = CARD_FORM_MESSAGES.holderName;
    const expiryDigits = cardDigits(values.expiry);
    const month = Number(expiryDigits.slice(0, 2));
    if (expiryDigits.length !== 4 || month < 1 || month > 12) {
      errors.expiry = CARD_FORM_MESSAGES.expiry;
    } else if (!parseCardExpiry(values.expiry, now)) {
      errors.expiry = CARD_FORM_MESSAGES.expired;
    }
    if (cardDigits(values.cvv).length !== cvvLengthFor(brand)) errors.cvv = CARD_FORM_MESSAGES.cvv;
  }

  if (values.useAccountCpf) {
    // CPF da conta: o servidor resolve pela sessão; nada a conferir aqui.
  } else if (!cardDigits(values.cpf)) errors.cpf = CARD_FORM_MESSAGES.cpf;
  else if (!payerCpfSchema.safeParse(values.cpf).success)
    errors.cpf = CARD_FORM_MESSAGES.cpfInvalid;

  if (!values.email.trim()) errors.email = CARD_FORM_MESSAGES.email;
  else if (!payerEmailSchema.safeParse(values.email).success) {
    errors.email = CARD_FORM_MESSAGES.emailInvalid;
  }

  if (fields.includes("birthDate")) {
    if (!values.birthDate) errors.birthDate = CARD_FORM_MESSAGES.birthDate;
    else if (!payerBirthDateSchema.safeParse(values.birthDate).success) {
      errors.birthDate = CARD_FORM_MESSAGES.birthDateInvalid;
    }
  }
  return errors;
}

export function firstCardError(errors: CardFormErrors): CardField | null {
  return CARD_FIELDS.find((field) => errors[field]) ?? null;
}

/** O que a tokenização devolve ao formulário: token de uso único + o que pode ser exibido. */
export type CardTokenized = {
  token: string;
  brand: CardPaymentBrand | null;
  lastFour: string | null;
};

/**
 * Corpo do Cartão no contrato: SÓ o token e os dados do pagador. Número, validade e CVV não têm
 * caminho até aqui (os objetos do contrato são estritos e recusariam). Com o CPF da conta vai
 * `useAccountCpf: true` e nenhum `cpf` (o servidor usa o da sessão).
 */
export function buildCardPaymentInput(
  sdk: CardTokenizerSdk,
  tokenized: CardTokenized,
  values: Pick<CardFormValues, "birthDate" | "cpf" | "email" | "useAccountCpf">,
): CardPaymentInputRaw {
  const display = { brand: tokenized.brand, lastFour: tokenized.lastFour };
  const email = values.email.trim().toLowerCase();
  const cpf = values.useAccountCpf
    ? { useAccountCpf: true as const }
    : { cpf: cardDigits(values.cpf) };
  if (sdk === "efi") {
    return {
      sdk,
      paymentToken: tokenized.token,
      payer: { ...cpf, birthDate: values.birthDate, email },
      ...display,
    };
  }
  return { sdk, token: tokenized.token, payer: { ...cpf, email }, ...display };
}

/** "Visa final 4242", para o resumo e a página do Pedido. */
export function describeCard(brand: CardPaymentBrand | null, lastFour: string | null): string {
  const label = brand ? CARD_PAYMENT_BRAND_LABELS[brand] : "Cartão";
  return lastFour ? `${label} final ${lastFour}` : label;
}

export const CARD_PAYMENT_BRAND_LABELS: Record<CardPaymentBrand, string> = {
  amex: "American Express",
  diners: "Diners",
  elo: "Elo",
  hipercard: "Hipercard",
  mastercard: "Mastercard",
  other: "Cartão",
  visa: "Visa",
};
