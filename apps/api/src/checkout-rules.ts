// Regras puras do checkout do Storefront (Ticket 24a), sem banco: estado público da Loja,
// meios de pagamento disponíveis e a cotação (preços, Delivery, mínimo, troco, total) recalculada
// no servidor sobre o snapshot lido do D1. A criação usa a mesma cotação e manda as condições
// para a escrita condicional em @foode/db (a autoridade final é o banco no momento da escrita).
import type {
  CheckoutSnapshot,
  CreateOrderDelivery,
  EffectivePaymentFee,
  OrderAddressData,
  OrderLineData,
  StorefrontOperation,
} from "@foode/db";
import {
  cartSubtotalCents,
  indexMenuItems,
  lineUnitCents,
  type MenuItem,
} from "@foode/shared/menu";
import { MAX_CENTS } from "@foode/shared/money";
import {
  CARD_BRANDS,
  type CardBrand,
  type CheckoutCreateRequest,
  type CheckoutError,
  type CheckoutQuoteRequest,
  type EtaRange,
  isValidChangeFor,
  ONLINE_PAYMENT_METHODS,
  type PaymentMethod,
  phoneE164Schema,
  saoPauloCivil,
  sortOpeningPeriods,
  storeOpenState,
  type StorefrontStoreState,
  storefrontStoreStateSchema,
} from "@foode/shared/order";

import { toPublicMenu } from "./public-menu";

/**
 * Meios online com integração pronta. PIX e Cartão entram nos Tickets 26/27: até lá, mesmo com
 * taxa Foode vigente, só `on_delivery` cria Pedido (e é o único exibido).
 */
export const LIVE_ONLINE_METHODS: readonly PaymentMethod[] = [];

/**
 * Meios disponíveis agora, em ordem neutra (P-4.4): online só com taxa Foode vigente (decisão 61)
 * E integração pronta; `on_delivery` sempre.
 */
export function availablePaymentMethods(
  fees: readonly Pick<EffectivePaymentFee, "method">[],
  live: readonly PaymentMethod[] = LIVE_ONLINE_METHODS,
): PaymentMethod[] {
  const online = ONLINE_PAYMENT_METHODS.filter(
    (method) => live.includes(method) && fees.some((fee) => fee.method === method),
  );
  return [...online, "on_delivery"];
}

function knownBrands(list: readonly string[]): CardBrand[] {
  return CARD_BRANDS.filter((brand) => list.includes(brand));
}

/** Retirada vale só ligada e com o endereço da Loja cadastrado (P-3.3). */
function pickupAvailable(state: StorefrontOperation): boolean {
  return state.operation.pickupEnabled && state.profile !== null;
}

/** Delivery como o Consumidor vê: só o modo ativo, só bairros ativos (P-CFG-5). */
function publicDelivery(state: StorefrontOperation): StorefrontStoreState["delivery"] {
  const { operation } = state;
  if (operation.deliveryMode === "fixed" && operation.fixedFeeCents !== null) {
    return {
      mode: "fixed",
      feeCents: operation.fixedFeeCents,
      minimumOrderCents: operation.deliveryMinimumOrderCents,
      eta: operation.deliveryEta,
    };
  }
  if (operation.deliveryMode === "neighborhood") {
    const neighborhoods = operation.neighborhoods
      .filter((n) => n.active)
      .map((n) => ({ id: n.id, name: n.name, feeCents: n.feeCents }));
    if (neighborhoods.length === 0) return null;
    return {
      mode: "neighborhood",
      neighborhoods,
      minimumOrderCents: operation.deliveryMinimumOrderCents,
      eta: operation.deliveryEta,
    };
  }
  return null;
}

/** 200 de `GET /storefront/lojas/:slug/estado` (validado com o schema público). */
export function buildStoreState(
  state: StorefrontOperation,
  now: Date,
  paymentMethods: PaymentMethod[],
): StorefrontStoreState {
  const { operation, profile } = state;
  const whatsapp = phoneE164Schema.safeParse(profile?.whatsapp);
  return storefrontStoreStateSchema.parse({
    slug: state.store.slug,
    name: state.store.name,
    availability: storeOpenState({
      now,
      paused: operation.pause.paused,
      periods: operation.hours,
    }),
    hours: sortOpeningPeriods(operation.hours).map((period) => ({
      weekday: period.weekday,
      opensAt: period.opensAt,
      closesAt: period.closesAt,
    })),
    delivery: publicDelivery(state),
    pickup:
      pickupAvailable(state) && profile
        ? { eta: operation.pickupEta, address: profile.address }
        : null,
    paymentMethods,
    cardBrands: {
      debit: knownBrands(operation.cardBrands.debit),
      credit: knownBrands(operation.cardBrands.credit),
    },
    whatsapp: whatsapp.success ? whatsapp.data : null,
  });
}

/** Cotação aprovada: totais e tudo que a escrita condicional precisa conferir. */
export type CheckoutQuote = {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  minimumOrder: { minimumCents: number; missingCents: number } | null;
  eta: EtaRange | null;
  /** Delivery cotado (modo, taxa e bairro), null na Retirada. */
  delivery: CreateOrderDelivery | null;
  /** Nome do bairro gravado no Pedido (do cadastro no modo por bairro; digitado na Taxa fixa). */
  neighborhoodName: string | null;
  lines: Array<OrderLineData & { menuItemId: string }>;
  itemPrices: Array<{ id: string; priceCents: number }>;
  civil: { weekday: number; time: string };
};

export type QuoteOutcome = { ok: true; quote: CheckoutQuote } | { ok: false; error: CheckoutError };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Dia ISO e HH:MM de São Paulo no instante (o mesmo usado na escrita condicional). */
export function civilNow(now: Date): { weekday: number; time: string } {
  const civil = saoPauloCivil(now.getTime());
  return { weekday: civil.weekday, time: `${pad(civil.hour)}:${pad(civil.minute)}` };
}

function lineSnapshot(item: MenuItem, line: CheckoutQuoteRequest["lines"][number]) {
  const complements = item.complementGroups.flatMap((group) =>
    (line.complementSelections[group.id] ?? []).flatMap((optionId) => {
      const option = group.options.find((candidate) => candidate.id === optionId);
      return option
        ? [{ groupName: group.name, optionName: option.name, priceCents: option.priceCents }]
        : [];
    }),
  );
  const additionals = line.additionalIds.flatMap((additionalId) => {
    const additional = item.additionals.find((candidate) => candidate.id === additionalId);
    return additional ? [{ name: additional.name, priceCents: additional.priceCents }] : [];
  });
  const unitPriceCents = lineUnitCents(item, line);
  return {
    menuItemId: item.id,
    itemName: item.name,
    quantity: line.quantity,
    unitPriceCents,
    totalCents: unitPriceCents * line.quantity,
    complements,
    additionals,
  };
}

/**
 * Cotação no servidor sobre o snapshot: Pausa e horário (a Pausa vence), Fulfillment ativo, bairro
 * ativo (por bairro) ou Taxa fixa, Cardápio (itens, escolhas e preços do D1), pedido mínimo do
 * Delivery sobre o subtotal dos itens. Ordem dos erros = ordem em que o Consumidor resolve.
 */
export function quoteCheckout(
  snapshot: CheckoutSnapshot,
  request: CheckoutQuoteRequest,
  now: Date,
): QuoteOutcome {
  const { operation } = snapshot;
  const availability = storeOpenState({
    now,
    paused: operation.pause.paused,
    periods: operation.hours,
  });
  if (availability.state === "paused") return { ok: false, error: { code: "store_paused" } };
  if (availability.state === "closed") return { ok: false, error: { code: "store_closed" } };

  let delivery: CreateOrderDelivery | null = null;
  let neighborhoodName: string | null = null;
  if (request.fulfillment === "pickup") {
    if (!pickupAvailable(snapshot)) {
      return { ok: false, error: { code: "fulfillment_unavailable" } };
    }
  } else {
    const offer = publicDelivery(snapshot);
    if (!offer) return { ok: false, error: { code: "fulfillment_unavailable" } };
    const address = request.address;
    if (offer.mode === "neighborhood") {
      const chosen = offer.neighborhoods.find((n) => n.id === address?.neighborhoodId);
      if (!chosen) return { ok: false, error: { code: "neighborhood_not_served" } };
      delivery = { mode: "neighborhood", neighborhoodId: chosen.id, feeCents: chosen.feeCents };
      neighborhoodName = chosen.name;
    } else {
      const typed = address?.neighborhoodName?.trim().replace(/\s+/gu, " ");
      if (!typed) return { ok: false, error: { code: "neighborhood_not_served" } };
      delivery = { mode: "fixed", feeCents: offer.feeCents };
      neighborhoodName = typed;
    }
  }

  const menu = toPublicMenu(snapshot.menu, null);
  const items = indexMenuItems(menu);
  const subtotal = cartSubtotalCents(items, request);
  if (!subtotal.ok) {
    return {
      ok: false,
      error: { code: "cart_invalid", lineIndex: subtotal.lineIndex, lineError: subtotal.error },
    };
  }
  const lines = request.lines.map((line) => lineSnapshot(items.get(line.itemId)!, line));
  const deliveryFeeCents = delivery?.feeCents ?? 0;
  const totalCents = subtotal.subtotalCents + deliveryFeeCents;
  if (totalCents > MAX_CENTS) {
    const lineIndex = request.lines.length - 1;
    return {
      ok: false,
      error: {
        code: "cart_invalid",
        lineIndex,
        lineError: { code: "quantity_invalid", quantity: request.lines[lineIndex]!.quantity },
      },
    };
  }

  const minimumCents =
    request.fulfillment === "delivery" ? operation.deliveryMinimumOrderCents : null;
  const minimumOrder =
    minimumCents === null
      ? null
      : {
          minimumCents,
          missingCents: Math.max(0, minimumCents - subtotal.subtotalCents),
        };
  if (minimumOrder && minimumOrder.missingCents > 0) {
    return { ok: false, error: { code: "below_minimum", ...minimumOrder } };
  }

  const prices = new Map<string, number>();
  for (const line of request.lines) prices.set(line.itemId, items.get(line.itemId)!.priceCents);

  return {
    ok: true,
    quote: {
      subtotalCents: subtotal.subtotalCents,
      deliveryFeeCents,
      discountCents: 0,
      totalCents,
      minimumOrder,
      eta: request.fulfillment === "delivery" ? operation.deliveryEta : operation.pickupEta,
      delivery,
      neighborhoodName,
      lines,
      itemPrices: [...prices].map(([id, priceCents]) => ({ id, priceCents })),
      civil: civilNow(now),
    },
  };
}

/** Pagamento da criação: meio disponível agora e troco ≥ total (P-4.2). */
export function checkPayment(
  quote: Pick<CheckoutQuote, "totalCents">,
  payment: CheckoutCreateRequest["payment"],
  available: readonly PaymentMethod[],
): CheckoutError | null {
  if (!available.includes(payment.method)) return { code: "payment_method_unavailable" };
  if (!isValidChangeFor(quote.totalCents, payment.changeForCents)) {
    return { code: "change_below_total" };
  }
  return null;
}

/** Endereço gravado no Pedido (bairro = nome cotado). */
export function orderAddressOf(
  request: CheckoutCreateRequest,
  neighborhoodName: string,
): OrderAddressData | null {
  const address = request.address;
  if (!address) return null;
  return {
    postalCode: address.postalCode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    reference: address.reference,
    neighborhood: neighborhoodName,
  };
}
