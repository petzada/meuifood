// Contrato do Cartão de crédito à vista (Ticket 27; decisões 60, 61, 65 e 71; ADR 0007).
//
// - O modo da Loja (Normal = Efí, Rápido = AbacatePay) é definido pelo Ops e NUNCA escolhido pelo
//   Storefront: o navegador recebe só "qual SDK de tokenização carregar" (`cardTokenizerSchema`)
//   com o identificador PÚBLICO da conta (payee code da Efí ou chave pública da AbacatePay).
// - Número, CVV e validade nunca saem do navegador: o corpo leva só o token de uso único
//   (`payment_token` da `payment-token-efi` ou `ctok_` do abacatepay.js), bandeira e últimos 4.
//   Os objetos são estritos: qualquer campo a mais (ex.: `number`, `cvv`) é recusado.
// - Dados do pagador só no Cartão: CPF (dígito verificador), e-mail e, na Efí, data de nascimento.
// - Estado público do pagamento: `processing` → `pending` | `approved` | `declined`, com motivo
//   exibível e as ações do recusado ("Tentar outro cartão" / "Pagar com PIX").
import { z } from "zod";

import { centsSchema } from "../money.js";
import { isValidCpf } from "../ops/documents.js";
import { CARD_MODE_PROVIDER, type CardMode } from "../ops/stores.js";

// ---- Tokenizador (o que o Storefront recebe para carregar o SDK certo).

/** SDK de tokenização no navegador; 1:1 com o modo do Cartão da Loja (Normal/Rápido). */
export const CARD_TOKENIZERS = ["efi", "abacatepay"] as const;
export type CardTokenizerSdk = (typeof CARD_TOKENIZERS)[number];

/** SDK do modo da Loja (`CARD_MODE_PROVIDER` de @foode/shared/ops: Normal = Efí, Rápido = AbacatePay). */
export function cardTokenizerSdkOf(mode: CardMode): CardTokenizerSdk {
  return CARD_MODE_PROVIDER[mode];
}

export const EFI_ENVIRONMENTS = ["production", "sandbox"] as const;
export type EfiEnvironmentName = (typeof EFI_ENVIRONMENTS)[number];

/** Identificador de conta Efí (payee code): público, hex de 32 posições na doc da Efí. */
export const efiPayeeCodeSchema = z.string().regex(/^[A-Za-z0-9]{16,64}$/u);
/** Chave pública do abacatepay.js (não é a chave de API). */
export const abacatePayPublicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,200}$/u);

/**
 * Parte de `GET /storefront/lojas/:slug/estado` (e da cotação) quando o Cartão está disponível:
 * diz só qual SDK carregar e com que identificador público. null = Cartão indisponível.
 */
export const cardTokenizerSchema = z.discriminatedUnion("sdk", [
  z.strictObject({
    sdk: z.literal("efi"),
    payeeCode: efiPayeeCodeSchema,
    environment: z.enum(EFI_ENVIRONMENTS),
  }),
  z.strictObject({
    sdk: z.literal("abacatepay"),
    publicKey: abacatePayPublicKeySchema,
  }),
]);
export type CardTokenizer = z.infer<typeof cardTokenizerSchema>;

// ---- Dados do pagador e token (corpo do checkout e da nova tentativa).

/** Bandeiras que o formulário reconhece (a lib do provedor confirma na tokenização). */
export const CARD_PAYMENT_BRANDS = [
  "visa",
  "mastercard",
  "elo",
  "amex",
  "hipercard",
  "diners",
  "other",
] as const;
export type CardPaymentBrand = (typeof CARD_PAYMENT_BRANDS)[number];

export const PAYER_EMAIL_MAX = 160;

/** CPF do pagador: aceita máscara, normaliza para 11 dígitos e confere o dígito verificador. */
export const payerCpfSchema = z
  .string()
  .transform((raw) => raw.replace(/[\s.-]/gu, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{11}$/u, "CPF inválido")
      .refine(isValidCpf, "CPF inválido"),
  );

export const payerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(PAYER_EMAIL_MAX)
  .pipe(z.email("e-mail inválido"));

/** Idade mínima do titular aceita no formulário (a Efí pede a data de nascimento). */
export const PAYER_MIN_AGE_YEARS = 16;

/** `YYYY-MM-DD` real (sem 31/02), entre 1900 e hoje − 16 anos. */
export const payerBirthDateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() - PAYER_MIN_AGE_YEARS);
  return value >= "1900-01-01" && date.getTime() <= limit.getTime();
}, "data de nascimento inválida");

/** Token Efí (`payment_token` da `payment-token-efi`): opaco, uso único. Nunca logar. */
export const efiPaymentTokenSchema = z.string().regex(/^[A-Za-z0-9]{16,256}$/u);
/** Token AbacatePay (`ctok_…` do abacatepay.js): uso único, 60 s. Nunca logar. */
export const abacatePayCardTokenSchema = z.string().regex(/^ctok_[A-Za-z0-9_-]{4,250}$/u);

/** Só para exibir ("Visa final 4242"); nunca usado para cobrar. */
const cardDisplayShape = {
  brand: z.enum(CARD_PAYMENT_BRANDS).nullish().default(null),
  lastFour: z
    .string()
    .regex(/^\d{4}$/u)
    .nullish()
    .default(null),
};

/**
 * Cartão no checkout: discriminado pelo SDK que o Storefront carregou. O servidor confere que o
 * `sdk` é o do modo ATUAL da Loja (senão `payment_method_unavailable`). Efí exige data de
 * nascimento; AbacatePay não. Objetos estritos: número/CVV/validade nunca passam.
 */
export const cardPaymentInputSchema = z.discriminatedUnion("sdk", [
  z.strictObject({
    sdk: z.literal("efi"),
    paymentToken: efiPaymentTokenSchema,
    payer: z.strictObject({
      cpf: payerCpfSchema,
      email: payerEmailSchema,
      birthDate: payerBirthDateSchema,
    }),
    ...cardDisplayShape,
  }),
  z.strictObject({
    sdk: z.literal("abacatepay"),
    token: abacatePayCardTokenSchema,
    payer: z.strictObject({
      cpf: payerCpfSchema,
      email: payerEmailSchema,
    }),
    ...cardDisplayShape,
  }),
]);
export type CardPaymentInput = z.infer<typeof cardPaymentInputSchema>;
export type CardPaymentInputRaw = z.input<typeof cardPaymentInputSchema>;

/**
 * Corpo de `POST /storefront/lojas/:slug/pedidos/:token/cartao` ("Tentar outro cartão" depois de
 * um recusado). `attemptKey` (UUID do navegador por tentativa) é a idempotência: mesma chave =
 * mesma intenção, sem cobrar duas vezes.
 */
export const cardRetryRequestSchema = z.strictObject({
  attemptKey: z.uuid(),
  card: cardPaymentInputSchema,
});
export type CardRetryRequest = z.infer<typeof cardRetryRequestSchema>;

// ---- Estado público do pagamento por Cartão (página do Pedido).

/**
 * - `processing`: cobrança sendo enviada ao provedor;
 * - `pending`: provedor em análise (antifraude/emissor); a página segue consultando;
 * - `approved`: aprovado na confirmação canônica (webhook/consulta autenticada) — Pedido pago;
 * - `declined`: recusado ou erro definitivo; ação "Tentar outro cartão" ou "Pagar com PIX".
 */
export const CARD_PAYMENT_STATES = ["processing", "pending", "approved", "declined"] as const;
export type CardPaymentState = (typeof CARD_PAYMENT_STATES)[number];
export const cardPaymentStateSchema = z.enum(CARD_PAYMENT_STATES);

/** Motivo exibível do recusado (código nosso; o texto do provedor nunca vai ao navegador). */
export const CARD_DECLINE_REASONS = [
  "issuer_declined",
  "invalid_payer_data",
  "token_expired",
  "provider_unavailable",
  "unknown",
] as const;
export type CardDeclineReason = (typeof CARD_DECLINE_REASONS)[number];
export const cardDeclineReasonSchema = z.enum(CARD_DECLINE_REASONS);

/** Ações do recusado (DIRETRIZES-UX-CLIENTE §6). `pix` só se o PIX estiver disponível na Loja. */
export const CARD_RETRY_ACTIONS = ["other_card", "pix"] as const;
export type CardRetryAction = (typeof CARD_RETRY_ACTIONS)[number];

export const orderCardSchema = z
  .object({
    state: cardPaymentStateSchema,
    /** Valor cobrado = total do Pedido + tarifa de serviço (decisão 71). */
    amountCents: centsSchema,
    brand: z.enum(CARD_PAYMENT_BRANDS).nullable(),
    lastFour: z
      .string()
      .regex(/^\d{4}$/u)
      .nullable(),
    /** Só em `declined`. */
    declineReason: cardDeclineReasonSchema.nullable(),
    /** Só em `declined`: o que o Consumidor pode fazer. */
    retryActions: z.array(z.enum(CARD_RETRY_ACTIONS)),
    /** Tokenizador para "Tentar outro cartão" (null fora do `declined` ou sem Cartão na Loja). */
    tokenizer: cardTokenizerSchema.nullable(),
  })
  .superRefine((card, ctx) => {
    const declined = card.state === "declined";
    if (declined !== (card.declineReason !== null)) {
      ctx.addIssue({ code: "custom", message: "motivo só no recusado", path: ["declineReason"] });
    }
    if (!declined && card.retryActions.length > 0) {
      ctx.addIssue({ code: "custom", message: "ações só no recusado", path: ["retryActions"] });
    }
  });
export type OrderCard = z.infer<typeof orderCardSchema>;

/** Estados em que a página do Pedido continua consultando. */
export function isCardAwaiting(state: CardPaymentState): boolean {
  return state === "processing" || state === "pending";
}

/** Título do bloco do Cartão na página do Pedido (lido em `aria-live`). */
export function cardStateLabelPt(state: CardPaymentState): string {
  switch (state) {
    case "processing":
      return "Processando o pagamento";
    case "pending":
      return "Pagamento em análise";
    case "approved":
      return "Pagamento aprovado";
    case "declined":
      return "Pagamento recusado";
  }
}

/** Mensagem do recusado (sem o texto do provedor). */
export function cardDeclineMessagePt(reason: CardDeclineReason): string {
  switch (reason) {
    case "issuer_declined":
      return "O banco do cartão recusou o pagamento. Tente outro cartão ou pague com PIX.";
    case "invalid_payer_data":
      return "Os dados do titular não conferem. Revise CPF, e-mail e data de nascimento.";
    case "token_expired":
      return "O tempo para confirmar o cartão acabou. Digite os dados de novo.";
    case "provider_unavailable":
      return "Não conseguimos falar com o processador do cartão agora. Tente de novo em instantes.";
    case "unknown":
      return "Não foi possível concluir o pagamento. Tente outro cartão ou pague com PIX.";
  }
}

// ---- Liberação prevista (Ledger; decisão 60). Regras puras ficam no Ticket 27 (implementação).

/** Efí (Normal): liberação em até 21 dias úteis depois da aprovação, ou a data informada. */
export const EFI_CARD_RELEASE_MAX_BUSINESS_DAYS = 21;
/** AbacatePay (Rápido): liberação em até 1 dia útil, ou a data informada. */
export const ABACATEPAY_CARD_RELEASE_MAX_BUSINESS_DAYS = 1;
