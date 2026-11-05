// Regras puras do checkout (Ticket 24a), sem banco: estado público da Loja, meios disponíveis e
// a cotação recalculada no servidor (Pausa/horário, Fulfillment, bairro, Cardápio, mínimo,
// troco). A escrita condicional no D1 fica em storefront.d1.test.ts (CI).
import type { CheckoutSnapshot, OperationSettings } from "@foode/db";
import {
  type CheckoutCreateRequest,
  type CheckoutQuoteRequest,
  storefrontStoreStateSchema,
} from "@foode/shared/order";
import { describe, expect, it } from "vitest";

import {
  availablePaymentMethods,
  buildStoreState,
  checkPayment,
  civilNow,
  quoteCheckout,
} from "./checkout-rules";

// Quinta-feira, 12:00 em São Paulo (UTC−3).
const NOW = new Date("2026-11-05T15:00:00.000Z");
const ids = {
  category: crypto.randomUUID(),
  burger: crypto.randomUUID(),
  soda: crypto.randomUUID(),
  group: crypto.randomUUID(),
  optionFree: crypto.randomUUID(),
  optionPaid: crypto.randomUUID(),
  bacon: crypto.randomUUID(),
  centro: crypto.randomUUID(),
  vilaInativa: crypto.randomUUID(),
};

function operation(overrides: Partial<OperationSettings> = {}): OperationSettings {
  return {
    pause: { paused: false },
    hours: [{ weekday: 4, opensAt: "11:00", closesAt: "15:00" }],
    pickupEnabled: true,
    deliveryMode: "neighborhood",
    fixedFeeCents: 700,
    neighborhoods: [
      { id: ids.centro, name: "Centro", feeCents: 500, active: true },
      { id: ids.vilaInativa, name: "Vila Inativa", feeCents: 900, active: false },
    ],
    deliveryMinimumOrderCents: null,
    deliveryEta: { minMinutes: 40, maxMinutes: 60 },
    pickupEta: { minMinutes: 15, maxMinutes: 20 },
    cardBrands: { debit: ["visa", "elo"], credit: ["mastercard"] },
    printOnAccept: false,
    deliveryRatePerKmCents: null,
    ...overrides,
  } as OperationSettings;
}

function snapshot(overrides: Partial<OperationSettings> = {}): CheckoutSnapshot {
  return {
    store: { id: crypto.randomUUID(), slug: "loja-a", name: "Loja A" },
    profile: {
      whatsapp: "5511987654321",
      address: {
        street: "Rua da Loja",
        number: "10",
        complement: null,
        district: "Centro",
        city: "São Paulo",
        state: "SP",
      },
    },
    operation: operation(overrides),
    menu: {
      slug: "loja-a",
      name: "Loja A",
      categories: [
        {
          id: ids.category,
          name: "Lanches",
          items: [
            {
              id: ids.burger,
              categoryId: ids.category,
              name: "X-Burger",
              description: "",
              priceCents: 2590,
              available: true,
              featured: false,
              imageObjectKey: null,
              complementGroups: [
                {
                  id: ids.group,
                  name: "Borda",
                  minSelect: 1,
                  maxSelect: 1,
                  options: [
                    { id: ids.optionFree, name: "Tradicional", priceCents: 0 },
                    { id: ids.optionPaid, name: "Catupiry", priceCents: 990 },
                  ],
                },
              ],
              additionals: [{ id: ids.bacon, name: "Bacon", priceCents: 500, available: true }],
            },
            {
              id: ids.soda,
              categoryId: ids.category,
              name: "Refri",
              description: "",
              priceCents: 600,
              available: false,
              featured: false,
              imageObjectKey: null,
              complementGroups: [],
              additionals: [],
            },
          ],
        },
      ],
    },
  };
}

const burgerLine = {
  itemId: ids.burger,
  quantity: 2,
  complementSelections: { [ids.group]: [ids.optionPaid] },
  additionalIds: [ids.bacon],
};

const address = {
  postalCode: null,
  street: "Rua do Consumidor",
  number: "42",
  complement: null,
  reference: null,
  neighborhoodId: ids.centro,
};

function deliveryRequest(overrides: Partial<CheckoutQuoteRequest> = {}): CheckoutQuoteRequest {
  return { lines: [burgerLine], fulfillment: "delivery", address, ...overrides };
}

describe("quoteCheckout", () => {
  it("recalcula itens, escolhas, Adicionais e taxa do bairro; grava o snapshot das linhas", () => {
    const outcome = quoteCheckout(snapshot(), deliveryRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { quote } = outcome;
    // (2590 + 990 + 500) × 2 = 8160; + 500 do Centro.
    expect(quote.subtotalCents).toBe(8160);
    expect(quote.deliveryFeeCents).toBe(500);
    expect(quote.totalCents).toBe(8660);
    expect(quote.delivery).toEqual({
      mode: "neighborhood",
      neighborhoodId: ids.centro,
      feeCents: 500,
    });
    expect(quote.neighborhoodName).toBe("Centro");
    expect(quote.eta).toEqual({ minMinutes: 40, maxMinutes: 60 });
    expect(quote.lines).toEqual([
      {
        menuItemId: ids.burger,
        itemName: "X-Burger",
        quantity: 2,
        unitPriceCents: 4080,
        totalCents: 8160,
        complements: [{ groupName: "Borda", optionName: "Catupiry", priceCents: 990 }],
        additionals: [{ name: "Bacon", priceCents: 500 }],
      },
    ]);
    expect(quote.itemPrices).toEqual([{ id: ids.burger, priceCents: 2590 }]);
    expect(quote.civil).toEqual({ weekday: 4, time: "12:00" });
  });

  it("Pausa vence o horário; fora do horário = store_closed", () => {
    const paused = snapshot({
      pause: {
        paused: true,
        pausedAt: NOW.toISOString(),
        pausedBy: { userId: "u", name: "Op", role: "operator" },
      },
    });
    expect(quoteCheckout(paused, deliveryRequest(), NOW)).toEqual({
      ok: false,
      error: { code: "store_paused" },
    });
    const closed = snapshot({ hours: [{ weekday: 4, opensAt: "18:00", closesAt: "23:00" }] });
    expect(quoteCheckout(closed, deliveryRequest(), NOW)).toEqual({
      ok: false,
      error: { code: "store_closed" },
    });
  });

  it("bairro inativo, ausente ou de outra lista = neighborhood_not_served", () => {
    for (const neighborhoodId of [ids.vilaInativa, crypto.randomUUID()]) {
      expect(
        quoteCheckout(
          snapshot(),
          deliveryRequest({ address: { ...address, neighborhoodId } }),
          NOW,
        ),
      ).toEqual({ ok: false, error: { code: "neighborhood_not_served" } });
    }
  });

  it("Taxa fixa usa o bairro digitado e a taxa da Loja", () => {
    const outcome = quoteCheckout(
      snapshot({ deliveryMode: "fixed", fixedFeeCents: 700 }),
      deliveryRequest({
        address: { ...address, neighborhoodId: null, neighborhoodName: "  Jardim   Novo " },
      }),
      NOW,
    );
    expect(outcome).toMatchObject({
      ok: true,
      quote: {
        deliveryFeeCents: 700,
        delivery: { mode: "fixed" },
        neighborhoodName: "Jardim Novo",
      },
    });
  });

  it("Fulfillment desligado = fulfillment_unavailable (Retirada sem endereço da Loja também)", () => {
    expect(quoteCheckout(snapshot({ deliveryMode: null }), deliveryRequest(), NOW)).toMatchObject({
      ok: false,
      error: { code: "fulfillment_unavailable" },
    });
    const noActive = snapshot({
      neighborhoods: [{ id: ids.vilaInativa, name: "Vila", feeCents: 1, active: false }],
    });
    expect(quoteCheckout(noActive, deliveryRequest(), NOW)).toMatchObject({
      ok: false,
      error: { code: "fulfillment_unavailable" },
    });
    const pickup = { lines: [burgerLine], fulfillment: "pickup" as const, address: null };
    expect(quoteCheckout(snapshot({ pickupEnabled: false }), pickup, NOW)).toMatchObject({
      ok: false,
      error: { code: "fulfillment_unavailable" },
    });
    expect(quoteCheckout({ ...snapshot(), profile: null }, pickup, NOW)).toMatchObject({
      ok: false,
      error: { code: "fulfillment_unavailable" },
    });
    expect(quoteCheckout(snapshot(), pickup, NOW)).toMatchObject({
      ok: true,
      quote: { deliveryFeeCents: 0, delivery: null, eta: { minMinutes: 15, maxMinutes: 20 } },
    });
  });

  it("item indisponível ou escolha faltando = cart_invalid com a linha", () => {
    const soda = { itemId: ids.soda, quantity: 1, complementSelections: {}, additionalIds: [] };
    expect(quoteCheckout(snapshot(), deliveryRequest({ lines: [burgerLine, soda] }), NOW)).toEqual({
      ok: false,
      error: {
        code: "cart_invalid",
        lineIndex: 1,
        lineError: { code: "item_unavailable", itemId: ids.soda },
      },
    });
    const noChoice = { ...burgerLine, complementSelections: {} };
    expect(quoteCheckout(snapshot(), deliveryRequest({ lines: [noChoice] }), NOW)).toMatchObject({
      ok: false,
      error: { code: "cart_invalid", lineIndex: 0, lineError: { code: "complement_too_few" } },
    });
  });

  it("pedido mínimo só no Delivery, sobre o subtotal dos itens (sem a taxa)", () => {
    const withMinimum = snapshot({ deliveryMinimumOrderCents: 8200 });
    expect(quoteCheckout(withMinimum, deliveryRequest(), NOW)).toEqual({
      ok: false,
      error: { code: "below_minimum", minimumCents: 8200, missingCents: 40 },
    });
    const pickup = { lines: [burgerLine], fulfillment: "pickup" as const, address: null };
    expect(quoteCheckout(withMinimum, pickup, NOW)).toMatchObject({
      ok: true,
      quote: { minimumOrder: null },
    });
    expect(
      quoteCheckout(snapshot({ deliveryMinimumOrderCents: 8160 }), deliveryRequest(), NOW),
    ).toMatchObject({ ok: true, quote: { minimumOrder: { minimumCents: 8160, missingCents: 0 } } });
  });
});

describe("checkPayment e meios", () => {
  const quote = { totalCents: 8660 };
  const payment = (
    method: CheckoutCreateRequest["payment"]["method"],
    changeForCents: number | null = null,
  ) => ({ method, changeForCents, card: null });

  it("só on_delivery até os Tickets 26/27, mesmo com taxa Foode vigente", () => {
    expect(availablePaymentMethods([])).toEqual(["on_delivery"]);
    expect(availablePaymentMethods([{ method: "pix" }, { method: "credit" }])).toEqual([
      "on_delivery",
    ]);
    // Com a integração pronta, o meio online só aparece com taxa vigente.
    expect(availablePaymentMethods([{ method: "pix" }], ["pix", "credit"])).toEqual([
      "pix",
      "on_delivery",
    ]);
    expect(checkPayment(quote, payment("pix"), ["on_delivery"])).toEqual({
      code: "payment_method_unavailable",
    });
  });

  it("troco ≥ total", () => {
    expect(checkPayment(quote, payment("on_delivery", 8659), ["on_delivery"])).toEqual({
      code: "change_below_total",
    });
    expect(checkPayment(quote, payment("on_delivery", 8660), ["on_delivery"])).toBeNull();
    expect(checkPayment(quote, payment("on_delivery"), ["on_delivery"])).toBeNull();
  });
});

describe("buildStoreState", () => {
  it("aberta, Delivery só com bairros ativos, Retirada com endereço e bandeiras conhecidas", () => {
    const state = buildStoreState(snapshot(), NOW, ["on_delivery"]);
    expect(storefrontStoreStateSchema.parse(state)).toEqual(state);
    expect(state.availability).toEqual({ state: "open", closesAt: "2026-11-05T18:00:00.000Z" });
    expect(state.delivery).toEqual({
      mode: "neighborhood",
      neighborhoods: [{ id: ids.centro, name: "Centro", feeCents: 500 }],
      minimumOrderCents: null,
      eta: { minMinutes: 40, maxMinutes: 60 },
    });
    expect(state.pickup?.address.street).toBe("Rua da Loja");
    expect(state.cardBrands).toEqual({ debit: ["visa", "elo"], credit: ["mastercard"] });
    expect(state.whatsapp).toBe("5511987654321");
    expect(JSON.stringify(state)).not.toContain(snapshot().store.id);
  });

  it("Pausa e fechada são estados distintos; Retirada desligada não mostra endereço", () => {
    const paused = buildStoreState(
      snapshot({
        pickupEnabled: false,
        pause: {
          paused: true,
          pausedAt: NOW.toISOString(),
          pausedBy: { userId: "u", name: "Dono", role: "owner" },
        },
      }),
      NOW,
      ["on_delivery"],
    );
    expect(paused.availability).toEqual({ state: "paused" });
    expect(paused.pickup).toBeNull();
    const closed = buildStoreState(
      snapshot({ hours: [{ weekday: 5, opensAt: "18:00", closesAt: "23:00" }] }),
      NOW,
      ["on_delivery"],
    );
    expect(closed.availability).toEqual({
      state: "closed",
      nextOpening: { at: "2026-11-06T21:00:00.000Z", weekday: 5, opensAt: "18:00" },
    });
  });
});

describe("civilNow", () => {
  it("dia ISO e HH:MM de São Paulo", () => {
    expect(civilNow(new Date("2026-11-09T02:30:00.000Z"))).toEqual({ weekday: 7, time: "23:30" });
  });
});
