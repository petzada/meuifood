import { describe, expect, it } from "vitest";

import {
  assertSingleStoreCart,
  cartContractSchema,
  createEmptyCart,
  previewCartTotalCents,
  previewLineTotalCents,
  validateCartLineChoices,
  type CatalogItemForCart,
} from "./cart-preview.js";

const burger: CatalogItemForCart = {
  id: "11111111-1111-4111-8111-111111111111",
  priceCents: 2500,
  complementGroups: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      required: true,
      options: [
        { id: "33333333-3333-4333-8333-333333333333" },
        { id: "44444444-4444-4444-8444-444444444444" },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      required: false,
      options: [{ id: "66666666-6666-4666-8666-666666666666" }],
    },
  ],
  additionals: [
    {
      available: true,
      id: "77777777-7777-4777-8777-777777777777",
      priceCents: 300,
    },
    {
      available: false,
      id: "88888888-8888-4888-8888-888888888888",
      priceCents: 500,
    },
  ],
};

describe("prévia do carrinho (contrato + centavos)", () => {
  it("bloqueia item sem Complemento obrigatório", () => {
    expect(
      validateCartLineChoices(burger, {
        additionalIds: [],
        complementSelections: {},
        quantity: 1,
      }),
    ).toEqual({ error: "missing_required_complement", ok: false });
  });

  it("aceita Complemento obrigatório e calcula prévia deterministicamente", () => {
    const line = {
      additionalIds: ["77777777-7777-4777-8777-777777777777"],
      complementSelections: {
        "22222222-2222-4222-8222-222222222222":
          "33333333-3333-4333-8333-333333333333",
      },
      quantity: 2,
    };
    expect(validateCartLineChoices(burger, line)).toEqual({ ok: true });
    // 2500 + 300 = 2800; ×2 = 5600
    expect(previewLineTotalCents(burger, line)).toBe(5600);
  });

  it("rejeita Adicional indisponível e opção alienígena", () => {
    expect(
      validateCartLineChoices(burger, {
        additionalIds: ["88888888-8888-4888-8888-888888888888"],
        complementSelections: {
          "22222222-2222-4222-8222-222222222222":
            "33333333-3333-4333-8333-333333333333",
        },
        quantity: 1,
      }),
    ).toEqual({ error: "additional_unavailable", ok: false });

    expect(
      validateCartLineChoices(burger, {
        additionalIds: [],
        complementSelections: {
          "22222222-2222-4222-8222-222222222222":
            "99999999-9999-4999-8999-999999999999",
        },
        quantity: 1,
      }),
    ).toEqual({ error: "invalid_complement_option", ok: false });
  });

  it("rejeita o mesmo Adicional repetido no contrato", () => {
    expect(
      validateCartLineChoices(burger, {
        additionalIds: [
          "77777777-7777-4777-8777-777777777777",
          "77777777-7777-4777-8777-777777777777",
        ],
        complementSelections: {
          "22222222-2222-4222-8222-222222222222":
            "33333333-3333-4333-8333-333333333333",
        },
        quantity: 1,
      }),
    ).toEqual({ error: "invalid_additional", ok: false });
  });

  it("não mistura Lojas/slugs no carrinho", () => {
    const cart = createEmptyCart("loja-a");
    cart.lines.push({
      additionalIds: [],
      complementSelections: {
        "22222222-2222-4222-8222-222222222222":
          "33333333-3333-4333-8333-333333333333",
      },
      itemId: burger.id,
      quantity: 1,
    });
    expect(assertSingleStoreCart(cart, "loja-a")).toEqual({ ok: true });
    expect(assertSingleStoreCart(cart, "loja-b")).toEqual({
      error: "store_mismatch",
      ok: false,
    });
  });

  it("soma o carrinho em centavos inteiros e o contrato referencia IDs", () => {
    const cart = cartContractSchema.parse({
      storeSlug: "cantina",
      lines: [
        {
          itemId: burger.id,
          quantity: 1,
          additionalIds: ["77777777-7777-4777-8777-777777777777"],
          complementSelections: {
            "22222222-2222-4222-8222-222222222222":
              "44444444-4444-4444-8444-444444444444",
          },
        },
      ],
    });
    const total = previewCartTotalCents(new Map([[burger.id, burger]]), cart);
    expect(total).toBe(2800);
    expect(cart.lines[0]?.itemId).toBe(burger.id);
    expect(cart.lines[0]?.complementSelections).toEqual({
      "22222222-2222-4222-8222-222222222222":
        "44444444-4444-4444-8444-444444444444",
    });
  });
});
