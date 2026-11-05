import { describe, expect, it } from "vitest";

import { can } from "../auth/policy.js";
import {
  checkoutCreateRequestSchema,
  checkoutErrorMessagePt,
  checkoutQuoteRequestSchema,
  checkoutQuoteResponseSchema,
  orderTrackingPath,
} from "./checkout.js";
import { orderCancelInputSchema, orderTransitionInputSchema } from "./painel.js";
import {
  cardBrandsSchema,
  etaRangeSchema,
  isValidChangeFor,
  minimumOrderGap,
  pauseStateSchema,
  storeSetFulfillmentInputSchema,
} from "./settings.js";
import { firstNameOf, phoneLookupRequestSchema, phoneLookupResponseSchema } from "./storefront.js";

const ITEM = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c";
const KEY = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const NEIGHBORHOOD = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const line = { itemId: ITEM, quantity: 2, additionalIds: [], complementSelections: {} };
const address = { street: "Rua das Flores", number: "123", neighborhoodId: NEIGHBORHOOD };

const createBase = {
  idempotencyKey: KEY,
  lines: [line],
  fulfillment: "pickup",
  customer: { name: " Maria Souza ", phone: "(11) 98765-4321" },
  payment: { method: "on_delivery" },
} as const;

describe("checkout: cotação e criação", () => {
  it("Delivery exige endereço; Retirada não aceita endereço", () => {
    expect(
      checkoutQuoteRequestSchema.safeParse({ lines: [line], fulfillment: "delivery" }).success,
    ).toBe(false);
    expect(
      checkoutQuoteRequestSchema.safeParse({ lines: [line], fulfillment: "delivery", address })
        .success,
    ).toBe(true);
    expect(
      checkoutQuoteRequestSchema.safeParse({ lines: [line], fulfillment: "pickup", address })
        .success,
    ).toBe(false);
  });

  it("endereço precisa de bairro (da lista ou texto na Taxa fixa); CEP opcional com 8 dígitos", () => {
    const base = { lines: [line], fulfillment: "delivery" as const };
    expect(
      checkoutQuoteRequestSchema.safeParse({ ...base, address: { street: "Rua A", number: "1" } })
        .success,
    ).toBe(false);
    const parsed = checkoutQuoteRequestSchema.parse({
      ...base,
      address: {
        street: "Rua A",
        number: "1",
        neighborhoodName: "Centro",
        postalCode: "01310-100",
      },
    });
    expect(parsed.address?.postalCode).toBe("01310100");
    expect(
      checkoutQuoteRequestSchema.safeParse({
        ...base,
        address: { ...address, postalCode: "123" },
      }).success,
    ).toBe(false);
  });

  it("normaliza nome e telefone; observação vazia vira null; até 200 caracteres", () => {
    const parsed = checkoutCreateRequestSchema.parse({ ...createBase, note: "   " });
    expect(parsed.customer).toEqual({ name: "Maria Souza", phone: "5511987654321" });
    expect(parsed.note).toBeNull();
    expect(parsed.payment.changeForCents).toBeNull();
    expect(
      checkoutCreateRequestSchema.safeParse({ ...createBase, note: "x".repeat(200) }).success,
    ).toBe(true);
    expect(
      checkoutCreateRequestSchema.safeParse({ ...createBase, note: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejeita telefone fixo, chave de idempotência fora de UUID e preço vindo do navegador", () => {
    expect(
      checkoutCreateRequestSchema.safeParse({
        ...createBase,
        customer: { name: "Ana", phone: "1133334444" },
      }).success,
    ).toBe(false);
    expect(
      checkoutCreateRequestSchema.safeParse({ ...createBase, idempotencyKey: "abc" }).success,
    ).toBe(false);
    const withPrice = checkoutCreateRequestSchema.parse({ ...createBase, totalCents: 1 });
    expect(withPrice).not.toHaveProperty("totalCents");
  });

  it("troco só no Pagamento na entrega", () => {
    expect(
      checkoutCreateRequestSchema.safeParse({
        ...createBase,
        payment: { method: "on_delivery", changeForCents: 10000 },
      }).success,
    ).toBe(true);
    expect(
      checkoutCreateRequestSchema.safeParse({
        ...createBase,
        payment: { method: "pix", changeForCents: 10000 },
      }).success,
    ).toBe(false);
    expect(isValidChangeFor(5000, 5000)).toBe(true);
    expect(isValidChangeFor(5000, 4999)).toBe(false);
    expect(isValidChangeFor(5000, null)).toBe(true);
  });

  it("pedido mínimo sobre o subtotal dos itens", () => {
    expect(minimumOrderGap(3000, 5000)).toEqual({ minimumCents: 5000, missingCents: 2000 });
    expect(minimumOrderGap(6000, 5000)).toEqual({ minimumCents: 5000, missingCents: 0 });
    expect(minimumOrderGap(100, null)).toBeNull();
  });

  it("resposta da cotação e mensagens dos erros", () => {
    expect(
      checkoutQuoteResponseSchema.safeParse({
        ok: true,
        subtotalCents: 3000,
        deliveryFeeCents: 500,
        discountCents: 0,
        totalCents: 3500,
        minimumOrder: { minimumCents: 5000, missingCents: 2000 },
        eta: { minMinutes: 30, maxMinutes: 45 },
        paymentMethods: ["on_delivery"],
      }).success,
    ).toBe(true);
    const error = { code: "below_minimum", minimumCents: 5000, missingCents: 2000 } as const;
    expect(checkoutQuoteResponseSchema.safeParse({ ok: false, error }).success).toBe(true);
    expect(checkoutErrorMessagePt(error)).toBe("Faltam R$ 20,00 para o pedido mínimo de R$ 50,00.");
    expect(checkoutErrorMessagePt({ code: "store_paused" })).toBe(
      "A Loja pausou os pedidos agora. Seu carrinho foi mantido.",
    );
  });

  it("caminho da página do Pedido", () => {
    expect(orderTrackingPath("pizza-do-ze", "abc_DEF-123")).toBe(
      "/loja/pizza-do-ze/pedido/abc_DEF-123",
    );
  });
});

describe("configuração operacional", () => {
  const fulfillment = {
    pickupEnabled: true,
    deliveryMode: "neighborhood",
    fixedFeeCents: null,
    neighborhoods: [{ name: "Centro", feeCents: 500, active: true }],
    deliveryMinimumOrderCents: null,
    deliveryEta: { minMinutes: 30, maxMinutes: 50 },
    pickupEta: null,
  };

  it("um modo de Delivery: Taxa fixa exige valor; por bairro exige um bairro ativo", () => {
    expect(storeSetFulfillmentInputSchema.safeParse(fulfillment).success).toBe(true);
    expect(
      storeSetFulfillmentInputSchema.safeParse({ ...fulfillment, deliveryMode: "fixed" }).success,
    ).toBe(false);
    expect(
      storeSetFulfillmentInputSchema.safeParse({
        ...fulfillment,
        neighborhoods: [{ name: "Centro", feeCents: 500, active: false }],
      }).success,
    ).toBe(false);
    expect(
      storeSetFulfillmentInputSchema.safeParse({ ...fulfillment, deliveryMode: null }).success,
    ).toBe(true);
  });

  it("bairro repetido (mesma chave normalizada) é rejeitado", () => {
    expect(
      storeSetFulfillmentInputSchema.safeParse({
        ...fulfillment,
        neighborhoods: [
          { name: "São José", feeCents: 500, active: true },
          { name: "sao  jose", feeCents: 600, active: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("tempo estimado mín ≤ máx; pedido mínimo > 0", () => {
    expect(etaRangeSchema.safeParse({ minMinutes: 50, maxMinutes: 30 }).success).toBe(false);
    expect(etaRangeSchema.safeParse({ minMinutes: 30, maxMinutes: 30 }).success).toBe(true);
    expect(
      storeSetFulfillmentInputSchema.safeParse({ ...fulfillment, deliveryMinimumOrderCents: 0 })
        .success,
    ).toBe(false);
  });

  it("bandeiras da lista fixa, sem repetir", () => {
    expect(cardBrandsSchema.safeParse({ debit: ["visa", "elo"], credit: [] }).success).toBe(true);
    expect(cardBrandsSchema.safeParse({ debit: ["visa", "visa"], credit: [] }).success).toBe(false);
    expect(cardBrandsSchema.safeParse({ debit: ["diners"], credit: [] }).success).toBe(false);
  });

  it("Pausa ligada carrega quem ativou", () => {
    expect(pauseStateSchema.safeParse({ paused: true }).success).toBe(false);
    expect(
      pauseStateSchema.safeParse({
        paused: true,
        pausedAt: "2026-11-05T15:00:00.000Z",
        pausedBy: { userId: "u1", name: "Ana", role: "operator" },
      }).success,
    ).toBe(true);
  });

  it("política: Operador pausa e opera Pedidos, mas não mexe na configuração", () => {
    expect(can("operator", "store.pause")).toBe(true);
    expect(can("operator", "orders.cancel")).toBe(true);
    expect(can("operator", "store.settings")).toBe(false);
    expect(can("owner", "store.pause")).toBe(true);
    expect(can("foode_ops", "store.pause")).toBe(false);
  });
});

describe("busca por telefone e Painel", () => {
  it("busca exige Turnstile e telefone válido; resposta mascarada", () => {
    expect(phoneLookupRequestSchema.safeParse({ phone: "11987654321" }).success).toBe(false);
    expect(
      phoneLookupRequestSchema.parse({ phone: "11987654321", turnstileToken: "t" }).phone,
    ).toBe("5511987654321");
    expect(
      phoneLookupResponseSchema.safeParse({
        found: true,
        confirmToken: "a".repeat(43),
        masked: { firstName: "Maria", street: "Rua das Flores", neighborhood: "Centro" },
      }).success,
    ).toBe(true);
    expect(firstNameOf("  Maria  Souza ")).toBe("Maria");
  });

  it("transição não cancela (há RPC própria) e leva o estado visto pelo Painel", () => {
    const orderId = KEY;
    expect(
      orderTransitionInputSchema.safeParse({ orderId, from: "received", to: "preparing" }).success,
    ).toBe(true);
    expect(
      orderTransitionInputSchema.safeParse({ orderId, from: "received", to: "cancelled" }).success,
    ).toBe(false);
    expect(orderCancelInputSchema.safeParse({ orderId, from: "preparing" }).success).toBe(true);
    expect(orderCancelInputSchema.safeParse({ orderId: "1" }).success).toBe(false);
  });
});
