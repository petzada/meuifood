// Contratos públicos do Storefront do Ticket 24a: estado da Loja e "Sobre a Loja", snapshot das
// linhas do Pedido, página do Pedido por token e busca de dados pelo telefone (P-2.1).
// Nada aqui carrega `store_id`, id interno de usuário ou dado de outra Loja.
import { z } from "zod";

import { centsSchema } from "../money.js";
import { cardTokenizerSchema, orderCardSchema } from "../payment/card.js";
import { orderPixSchema } from "../payment/pix.js";
import { storefrontShowcaseSchema } from "../onboarding/showcase.js";
import { phoneE164Schema, customerPhoneSchema } from "./checkout.js";
import { civilTimeSchema, storeOpenStateSchema, weekdaySchema } from "./hours.js";
import { cardBrandsSchema, etaRangeSchema } from "./settings.js";
import { fulfillmentSchema, orderStatusSchema, paymentMethodSchema } from "./status.js";

// ---- Estado público da Loja (cabeçalho C1 + sheet "Sobre a Loja" C6/P-5.1).

const publicNeighborhoodSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  feeCents: centsSchema,
});

/** Delivery como o Consumidor vê: só o modo ativo; bairros inativos não aparecem (P-CFG-5). */
export const publicDeliverySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("fixed"),
    feeCents: centsSchema,
    minimumOrderCents: centsSchema.nullable(),
    eta: etaRangeSchema.nullable(),
  }),
  z.object({
    mode: z.literal("neighborhood"),
    neighborhoods: z.array(publicNeighborhoodSchema).min(1),
    minimumOrderCents: centsSchema.nullable(),
    eta: etaRangeSchema.nullable(),
  }),
]);
export type PublicDelivery = z.infer<typeof publicDeliverySchema>;

/** Endereço da Loja: só aparece com Retirada ativa (P-3.3). */
export const publicStoreAddressSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.string().length(2),
});

export const publicPickupSchema = z.object({
  eta: etaRangeSchema.nullable(),
  address: publicStoreAddressSchema,
});

/**
 * 200 de `GET /storefront/lojas/:slug/estado`. `availability` = aberta (até quando), fechada
 * (próxima abertura) ou em Pausa — estados distintos no cabeçalho, checkout bloqueado nos dois
 * últimos. Loja fora de `active` = 404 `store_not_found` (Cardápio indisponível). Delivery/Retirada
 * null = desligado; bandeiras vazias e tempo null não aparecem (P-2.4, P-4.3).
 */
export const storefrontStoreStateSchema = z.object({
  slug: z.string(),
  name: z.string(),
  availability: storeOpenStateSchema,
  /** Grade da semana para "Sobre a Loja" (ordenada por dia e início). */
  hours: z.array(
    z.object({ weekday: weekdaySchema, opensAt: civilTimeSchema, closesAt: civilTimeSchema }),
  ),
  delivery: publicDeliverySchema.nullable(),
  pickup: publicPickupSchema.nullable(),
  /** Meios disponíveis agora (online só com taxa Foode vigente), sem destaque (P-4.4). */
  paymentMethods: z.array(paymentMethodSchema),
  cardBrands: cardBrandsSchema,
  /**
   * Ticket 27: qual SDK de tokenização carregar (e o identificador público da conta), derivado do
   * modo do Cartão da Loja no servidor; null = Crédito indisponível. O Storefront não escolhe o
   * provedor. Opcional só para respostas anteriores ao 27 (ausente = null).
   */
  cardTokenizer: cardTokenizerSchema.nullable().optional(),
  /** WhatsApp da Loja para `wa.me` "Falar com a Loja". */
  whatsapp: phoneE164Schema.nullable(),
  /**
   * Vitrine do Ticket 28: logo, capa, descrição (cabeçalho, "Sobre a Loja", meta description),
   * Instagram e IDs de Pixel só desta Loja. A api sempre envia; opcional só para respostas e
   * fixtures anteriores ao 28 continuarem válidas (ausente = `EMPTY_STOREFRONT_SHOWCASE`).
   */
  showcase: storefrontShowcaseSchema.optional(),
});
export type StorefrontStoreState = z.infer<typeof storefrontStoreStateSchema>;

// ---- Snapshot das linhas do Pedido (gravado em JSON no D1; preço do momento da compra).

export const orderComplementSnapshotSchema = z.object({
  groupName: z.string(),
  optionName: z.string(),
  priceCents: centsSchema,
});
export type OrderComplementSnapshot = z.infer<typeof orderComplementSnapshotSchema>;

export const orderAdditionalSnapshotSchema = z.object({
  name: z.string(),
  priceCents: centsSchema,
});
export type OrderAdditionalSnapshot = z.infer<typeof orderAdditionalSnapshotSchema>;

/** Linha do Pedido como Consumidor e Painel veem (= snapshot). */
export const orderLineViewSchema = z.object({
  itemName: z.string(),
  quantity: z.number().int().min(1),
  /** Preço unitário com Complementos e Adicionais. */
  unitPriceCents: centsSchema,
  totalCents: centsSchema,
  complements: z.array(orderComplementSnapshotSchema),
  additionals: z.array(orderAdditionalSnapshotSchema),
});
export type OrderLineView = z.infer<typeof orderLineViewSchema>;

/** Endereço do Delivery gravado no Pedido (bairro = nome no momento da compra). */
export const orderAddressViewSchema = z.object({
  postalCode: z.string().nullable(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  reference: z.string().nullable(),
  neighborhood: z.string(),
});
export type OrderAddressView = z.infer<typeof orderAddressViewSchema>;

// ---- Página do Pedido (acompanhamento por token).

/** Intervalo de atualização da página do Pedido (status em `aria-live`). */
export const ORDER_TRACKING_POLL_INTERVAL_MS = 15_000;

/**
 * 200 de `GET /storefront/lojas/:slug/pedidos/:token`. Token de outra Loja ou inexistente = 404
 * `order_not_found` (sem distinguir). Sem telefone; o endereço é o do próprio Pedido.
 */
export const orderTrackingSchema = z.object({
  code: z.number().int().min(1),
  status: orderStatusSchema,
  fulfillment: fulfillmentSchema,
  createdAt: z.iso.datetime(),
  /** Tempo estimado gravado na criação (o do Fulfillment naquele momento). */
  eta: etaRangeSchema.nullable(),
  store: z.object({ slug: z.string(), name: z.string(), whatsapp: phoneE164Schema.nullable() }),
  customerFirstName: z.string(),
  lines: z.array(orderLineViewSchema).min(1),
  subtotalCents: centsSchema,
  deliveryFeeCents: centsSchema,
  discountCents: centsSchema,
  /** Total do Pedido (itens + Delivery − Cupom), sem a tarifa de serviço. */
  totalCents: centsSchema,
  /**
   * Tarifa de serviço do pagamento online (decisão 71); 0 no Pagamento na entrega. O Consumidor
   * paga `totalCents + serviceFeeCents`.
   */
  serviceFeeCents: centsSchema.default(0),
  payment: z.object({ method: paymentMethodSchema, changeForCents: centsSchema.nullable() }),
  /** Cobrança PIX (Ticket 26): só em Pedido `pix`; null nos demais meios. */
  pix: orderPixSchema.nullable().default(null),
  /** Pagamento por Cartão (Ticket 27): só em Pedido `credit` (última tentativa); null nos demais. */
  card: orderCardSchema.nullable().default(null),
  note: z.string().nullable(),
  address: orderAddressViewSchema.nullable(),
});
export type OrderTracking = z.infer<typeof orderTrackingSchema>;

// ---- Busca de dados pelo telefone (P-2.1, decisões 43/64/65): só a mesma Loja, mascarada,
// Turnstile + rate limit por IP, auditoria sem telefone em claro, sem código de verificação.

/** Máximo de consultas por IP (hash) por janela, por Loja. */
export const PHONE_LOOKUP_RATE_LIMIT = { max: 5, windowSeconds: 600 } as const;
/** Validade do token que libera os dados completos depois do "Sou eu". */
export const PHONE_LOOKUP_CONFIRM_TTL_SECONDS = 300;

export const PHONE_LOOKUP_RESULTS = [
  "found",
  "not_found",
  "rate_limited",
  "captcha_failed",
] as const;
export type PhoneLookupResult = (typeof PHONE_LOOKUP_RESULTS)[number];

/** Corpo de `POST /storefront/lojas/:slug/clientes/busca`. */
export const phoneLookupRequestSchema = z.object({
  phone: customerPhoneSchema,
  turnstileToken: z.string().min(1).max(2048),
});
export type PhoneLookupRequest = z.infer<typeof phoneLookupRequestSchema>;

export const phoneLookupConfirmTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u);

/**
 * 200 da busca. Encontrado = só primeiro nome e rua sem número (+ bairro), e um `confirmToken`
 * de uso único e curto. 429 `rate_limited`; 403 `captcha_failed`.
 */
export const phoneLookupResponseSchema = z.discriminatedUnion("found", [
  /**
   * `hasAccount: true` (decisão 68, Ticket 13): o telefone tem conta Foode; o checkout oferece
   * "Entrar com WhatsApp" e NADA da conta nem de Pedidos aparece sem o código (nem mascarado).
   */
  z.object({ found: z.literal(false), hasAccount: z.boolean().optional() }),
  z.object({
    found: z.literal(true),
    confirmToken: phoneLookupConfirmTokenSchema,
    masked: z.object({
      firstName: z.string(),
      street: z.string().nullable(),
      neighborhood: z.string().nullable(),
    }),
  }),
]);
export type PhoneLookupResponse = z.infer<typeof phoneLookupResponseSchema>;

/** Corpo de `POST /storefront/lojas/:slug/clientes/confirmar` ("Sou eu"). */
export const phoneLookupConfirmRequestSchema = z.object({
  confirmToken: phoneLookupConfirmTokenSchema,
});

/**
 * 200 do "Sou eu": dados completos do último Pedido na mesma Loja. Token vencido, usado ou de
 * outra Loja = `{ found: false }`. O formulário pré-seleciona o bairro só se o nome bater com um
 * bairro ativo da lista.
 */
export const phoneLookupConfirmResponseSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    customer: z.object({ name: z.string(), phone: phoneE164Schema }),
    address: orderAddressViewSchema.nullable(),
  }),
]);
export type PhoneLookupConfirmResponse = z.infer<typeof phoneLookupConfirmResponseSchema>;

/** Primeiro nome para a resposta mascarada ("Maria Souza" → "Maria"). */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/u)[0] ?? "";
}
