// Contrato do checkout do Storefront (Ticket 24a): cotação e criação idempotente do Pedido.
// O navegador manda só ids, quantidades e dados do Consumidor; preço, taxa de Delivery, mínimo,
// troco e total são recalculados no servidor (Tickets 08/09). A Loja sai do Slug da URL.
// Loja `active`, Pausa, horário, Retirada e bairro são conferidos na mesma escrita do Pedido.
import { z } from "zod";

import { centsSchema, formatBRL } from "../money.js";
import { cartLineSchema, MAX_CART_LINES } from "../menu/cart.js";
import { normalizeBrazilianMobilePhone } from "../phone-br.js";
import { etaRangeSchema, neighborhoodNameSchema } from "./settings.js";
import { fulfillmentSchema, paymentMethodSchema } from "./status.js";

/** Observação geral do Pedido (P-2.3); não existe observação por item (P-1.5). */
export const ORDER_NOTE_MAX = 200;
export const CUSTOMER_NAME_MAX = 120;

/** Texto opcional: aparado; vazio vira null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
}

export const orderNoteSchema = optionalText(ORDER_NOTE_MAX);

export const customerNameSchema = z.string().trim().min(1).max(CUSTOMER_NAME_MAX);

/** WhatsApp do Consumidor; normaliza para E.164 sem "+" (`55DD9XXXXXXXX`). */
export const customerPhoneSchema = z.string().transform((raw, ctx) => {
  const result = normalizeBrazilianMobilePhone(raw);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: "telefone inválido" });
    return z.NEVER;
  }
  return result.e164;
});

/** E.164 já normalizado (saída do servidor). */
export const phoneE164Schema = z.string().regex(/^55[1-9]\d9\d{8}$/u);

/** CEP opcional (P-3.1): 8 dígitos; aceita "12345-678". */
export const postalCodeSchema = z
  .string()
  .transform((raw) => raw.replace(/\D/gu, ""))
  .pipe(z.string().length(8))
  .nullish()
  .transform((value) => value ?? null);

export const STREET_MAX = 200;
export const ADDRESS_NUMBER_MAX = 20;
export const ADDRESS_COMPLEMENT_MAX = 120;
export const ADDRESS_REFERENCE_MAX = 160;

/**
 * Endereço do Delivery. No modo "por bairro" o bairro vem da lista da Loja (`neighborhoodId`); na
 * Taxa fixa é texto livre (`neighborhoodName`). Qual dos dois vale depende da configuração da
 * Loja, conferida no servidor (`neighborhood_not_served`).
 */
export const deliveryAddressInputSchema = z
  .object({
    postalCode: postalCodeSchema,
    street: z.string().trim().min(1).max(STREET_MAX),
    number: z.string().trim().min(1).max(ADDRESS_NUMBER_MAX),
    complement: optionalText(ADDRESS_COMPLEMENT_MAX),
    reference: optionalText(ADDRESS_REFERENCE_MAX),
    neighborhoodId: z.string().uuid().nullish(),
    neighborhoodName: neighborhoodNameSchema.nullish(),
  })
  .refine((address) => Boolean(address.neighborhoodId ?? address.neighborhoodName), {
    message: "escolha o bairro",
    path: ["neighborhoodId"],
  });
export type DeliveryAddressInput = z.infer<typeof deliveryAddressInputSchema>;

const cartShape = {
  lines: z.array(cartLineSchema).min(1).max(MAX_CART_LINES),
  fulfillment: fulfillmentSchema,
  address: deliveryAddressInputSchema.nullish(),
};

/** Delivery exige endereço; Retirada não tem endereço. */
function refineAddress(
  input: { fulfillment: "delivery" | "pickup"; address?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (input.fulfillment === "delivery" && !input.address) {
    ctx.addIssue({ code: "custom", message: "informe o endereço", path: ["address"] });
  }
  if (input.fulfillment === "pickup" && input.address) {
    ctx.addIssue({ code: "custom", message: "Retirada não tem endereço", path: ["address"] });
  }
}

const checkoutCartSchema = z.object(cartShape).superRefine(refineAddress);

/** Cotação (sem gravar nada): mesmo corpo do carrinho + Fulfillment e endereço. */
export const checkoutQuoteRequestSchema = checkoutCartSchema;
export type CheckoutQuoteRequest = z.infer<typeof checkoutQuoteRequestSchema>;

/**
 * Criação do Pedido. `idempotencyKey` (UUID gerado no navegador ao abrir o checkout) é a mesma em
 * todo retry: mesma chave + mesmo corpo devolve o mesmo Pedido; mesma chave + corpo diferente =
 * `idempotency_conflict`. `changeForCents` só com `on_delivery`.
 */
export const checkoutCreateRequestSchema = z
  .object({
    ...cartShape,
    idempotencyKey: z.string().uuid(),
    customer: z.object({ name: customerNameSchema, phone: customerPhoneSchema }),
    payment: z.object({
      method: paymentMethodSchema,
      changeForCents: centsSchema
        .min(1)
        .nullish()
        .transform((value) => value ?? null),
    }),
    note: orderNoteSchema,
  })
  .superRefine((input, ctx) => {
    refineAddress(input, ctx);
    if (input.payment.method !== "on_delivery" && input.payment.changeForCents !== null) {
      ctx.addIssue({
        code: "custom",
        message: "troco só no Pagamento na entrega",
        path: ["payment", "changeForCents"],
      });
    }
  });
export type CheckoutCreateRequest = z.infer<typeof checkoutCreateRequestSchema>;
export type CheckoutCreateRequestInput = z.input<typeof checkoutCreateRequestSchema>;

// ---- Erros do checkout (mesmo shape na cotação e na criação).

const CART_LINE_ERROR_CODES = [
  "additional_unavailable",
  "complement_duplicate_option",
  "complement_too_few",
  "complement_too_many",
  "invalid_additional",
  "invalid_complement_group",
  "invalid_complement_option",
  "item_not_found",
  "item_unavailable",
  "quantity_invalid",
] as const;

export const CHECKOUT_ERROR_CODES = [
  "store_paused",
  "store_closed",
  "fulfillment_unavailable",
  "neighborhood_not_served",
  "cart_invalid",
  "below_minimum",
  "payment_method_unavailable",
  "change_below_total",
  "idempotency_conflict",
] as const;
export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];

export const checkoutErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("store_paused") }),
  z.object({ code: z.literal("store_closed") }),
  z.object({ code: z.literal("fulfillment_unavailable") }),
  z.object({ code: z.literal("neighborhood_not_served") }),
  z.object({
    code: z.literal("cart_invalid"),
    lineIndex: z.number().int().min(0),
    lineError: z.looseObject({ code: z.enum(CART_LINE_ERROR_CODES) }),
  }),
  z.object({
    code: z.literal("below_minimum"),
    minimumCents: centsSchema,
    missingCents: centsSchema,
  }),
  z.object({ code: z.literal("payment_method_unavailable") }),
  z.object({ code: z.literal("change_below_total") }),
  z.object({ code: z.literal("idempotency_conflict") }),
]);
export type CheckoutError = z.infer<typeof checkoutErrorSchema>;

/** Mensagem acima do CTA (X7, G4). Carrinho e formulário são preservados em todos os casos. */
export function checkoutErrorMessagePt(error: CheckoutError): string {
  switch (error.code) {
    case "store_paused":
      return "A Loja pausou os pedidos agora. Seu carrinho foi mantido.";
    case "store_closed":
      return "A Loja fechou agora. Seu carrinho foi mantido.";
    case "fulfillment_unavailable":
      return "Essa forma de receber não está disponível agora. Escolha outra.";
    case "neighborhood_not_served":
      return "A Loja não entrega nesse bairro.";
    case "cart_invalid":
      return "Um item do carrinho mudou. Revise o carrinho.";
    case "below_minimum":
      return `Faltam ${formatBRL(error.missingCents)} para o pedido mínimo de ${formatBRL(error.minimumCents)}.`;
    case "payment_method_unavailable":
      return "Esse meio de pagamento não está disponível. Escolha outro.";
    case "change_below_total":
      return "O troco precisa ser para um valor igual ou maior que o total.";
    case "idempotency_conflict":
      return "Seu pedido mudou depois do envio. Confira e toque em Fazer pedido de novo.";
  }
}

// ---- Respostas.

const totalsSchema = z.object({
  subtotalCents: centsSchema,
  deliveryFeeCents: centsSchema,
  /** Desconto de Cupom (Ticket 13); 0 até lá. */
  discountCents: centsSchema,
  totalCents: centsSchema,
});
export type OrderTotals = z.infer<typeof totalsSchema>;
export const orderTotalsSchema = totalsSchema;

/**
 * 200 da cotação. `ok: true` traz totais, faixa do pedido mínimo (só Delivery; null sem mínimo),
 * tempo estimado do Fulfillment e os meios disponíveis agora. `ok: false` traz o erro.
 */
export const checkoutQuoteResponseSchema = z.discriminatedUnion("ok", [
  totalsSchema.extend({
    ok: z.literal(true),
    minimumOrder: z.object({ minimumCents: centsSchema, missingCents: centsSchema }).nullable(),
    eta: etaRangeSchema.nullable(),
    paymentMethods: z.array(paymentMethodSchema),
  }),
  z.object({ ok: z.literal(false), error: checkoutErrorSchema }),
]);
export type CheckoutQuoteResponse = z.infer<typeof checkoutQuoteResponseSchema>;

/** Token de acompanhamento: opaco, base64url; o banco guarda só o SHA-256. */
export const orderAccessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u);

/**
 * 201 (novo) ou 200 (`replayed: true`, mesma chave e mesmo corpo) da criação. `trackingPath` é o
 * caminho da página do Pedido no Storefront (`/loja/{slug}/pedido/{token}`).
 */
export const checkoutCreateResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    replayed: z.boolean(),
    orderCode: z.number().int().min(1),
    accessToken: orderAccessTokenSchema,
    trackingPath: z.string().startsWith("/"),
  }),
  z.object({ ok: z.literal(false), error: checkoutErrorSchema }),
]);
export type CheckoutCreateResponse = z.infer<typeof checkoutCreateResponseSchema>;

/** Caminho da página do Pedido no Storefront. */
export function orderTrackingPath(storeSlug: string, accessToken: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(accessToken)}`;
}

/** Status HTTP de cada erro do checkout (rotas públicas). */
export function checkoutErrorHttpStatus(code: CheckoutErrorCode): 409 | 422 {
  return code === "idempotency_conflict" || code === "store_paused" || code === "store_closed"
    ? 409
    : 422;
}
