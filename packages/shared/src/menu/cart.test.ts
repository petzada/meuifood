import { describe, expect, it } from "vitest";

import {
  MAX_LINE_QUANTITY,
  addCartLine,
  assertSingleStore,
  cartLineErrorMessagePt,
  cartSchema,
  cartSubtotalCents,
  createEmptyCart,
  lineSubtotalCents,
  sameLineChoices,
  setCartLineQuantity,
  validateCartLine,
  type CartLine,
} from "./cart.js";
import { burger, ids, publicMenu, soda, unavailableItem } from "./fixtures.js";
import { indexMenuItems } from "./schema.js";

const itemsById = indexMenuItems(publicMenu);

const validBurgerLine: CartLine = {
  additionalIds: [ids.additionalBacon],
  complementSelections: {
    [ids.groupSteak]: [ids.optionSteakMedium],
    [ids.groupSauces]: [ids.optionSauceBbq, ids.optionSauceMayo],
  },
  itemId: ids.burger,
  quantity: 2,
};

const sodaLine: CartLine = {
  additionalIds: [],
  complementSelections: {},
  itemId: ids.soda,
  quantity: 1,
};

describe("validateCartLine", () => {
  it("aceita linha dentro dos limites de cada grupo", () => {
    expect(validateCartLine(burger, validBurgerLine)).toEqual({ ok: true });
    expect(validateCartLine(soda, sodaLine)).toEqual({ ok: true });
  });

  it("exige o mínimo do grupo obrigatório", () => {
    const result = validateCartLine(burger, { ...validBurgerLine, complementSelections: {} });
    expect(result).toEqual({
      error: { code: "complement_too_few", groupId: ids.groupSteak, minSelect: 1, selected: 0 },
      ok: false,
    });
  });

  it("bloqueia acima do máximo do grupo", () => {
    const result = validateCartLine(burger, {
      ...validBurgerLine,
      complementSelections: {
        ...validBurgerLine.complementSelections,
        [ids.groupSauces]: [ids.optionSauceBbq, ids.optionSauceMayo, ids.optionSauceMustard],
      },
    });
    expect(result).toEqual({
      error: { code: "complement_too_many", groupId: ids.groupSauces, maxSelect: 2, selected: 3 },
      ok: false,
    });
  });

  it("rejeita opção repetida, opção de outro grupo e grupo inexistente", () => {
    expect(
      validateCartLine(burger, {
        ...validBurgerLine,
        complementSelections: {
          ...validBurgerLine.complementSelections,
          [ids.groupSauces]: [ids.optionSauceBbq, ids.optionSauceBbq],
        },
      }),
    ).toEqual({
      error: { code: "complement_duplicate_option", groupId: ids.groupSauces },
      ok: false,
    });

    expect(
      validateCartLine(burger, {
        ...validBurgerLine,
        complementSelections: {
          ...validBurgerLine.complementSelections,
          [ids.groupBread]: [ids.optionSauceBbq],
        },
      }),
    ).toEqual({
      error: {
        code: "invalid_complement_option",
        groupId: ids.groupBread,
        optionId: ids.optionSauceBbq,
      },
      ok: false,
    });

    expect(
      validateCartLine(burger, {
        ...validBurgerLine,
        complementSelections: { ...validBurgerLine.complementSelections, [ids.category]: [] },
      }),
    ).toEqual({ error: { code: "invalid_complement_group", groupId: ids.category }, ok: false });
  });

  it("rejeita Adicional inexistente, repetido ou indisponível", () => {
    expect(validateCartLine(burger, { ...validBurgerLine, additionalIds: [ids.soda] })).toEqual({
      error: { code: "invalid_additional", additionalId: ids.soda },
      ok: false,
    });
    expect(
      validateCartLine(burger, {
        ...validBurgerLine,
        additionalIds: [ids.additionalBacon, ids.additionalBacon],
      }),
    ).toEqual({
      error: { code: "invalid_additional", additionalId: ids.additionalBacon },
      ok: false,
    });
    expect(
      validateCartLine(burger, { ...validBurgerLine, additionalIds: [ids.additionalEggOff] }),
    ).toEqual({
      error: { code: "additional_unavailable", additionalId: ids.additionalEggOff },
      ok: false,
    });
  });

  it("rejeita item ausente, indisponível e quantidade fora da faixa", () => {
    expect(validateCartLine(undefined, sodaLine, ids.soda)).toEqual({
      error: { code: "item_not_found", itemId: ids.soda },
      ok: false,
    });
    expect(validateCartLine(unavailableItem, sodaLine)).toEqual({
      error: { code: "item_unavailable", itemId: ids.unavailableItem },
      ok: false,
    });
    for (const quantity of [0, -1, 1.5, MAX_LINE_QUANTITY + 1]) {
      expect(validateCartLine(soda, { ...sodaLine, quantity })).toEqual({
        error: { code: "quantity_invalid", quantity },
        ok: false,
      });
    }
  });

  it("tem mensagem PT-BR para todo código", () => {
    const codes = [
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
    for (const code of codes) expect(cartLineErrorMessagePt[code]).toBeTruthy();
  });
});

describe("subtotais", () => {
  it("calcula a linha: (item + Adicionais) × quantidade", () => {
    expect(lineSubtotalCents(burger, validBurgerLine)).toBe((2500 + 300) * 2);
    expect(lineSubtotalCents(soda, sodaLine)).toBe(600);
  });

  it("devolve null para linha inválida", () => {
    expect(lineSubtotalCents(burger, { ...validBurgerLine, complementSelections: {} })).toBeNull();
    expect(lineSubtotalCents(undefined, sodaLine)).toBeNull();
  });

  it("soma o carrinho e aponta a linha inválida", () => {
    const ok = cartSubtotalCents(itemsById, { lines: [validBurgerLine, sodaLine] });
    expect(ok).toEqual({
      lines: [
        { itemId: ids.burger, subtotalCents: 5600 },
        { itemId: ids.soda, subtotalCents: 600 },
      ],
      ok: true,
      subtotalCents: 6200,
    });

    const bad = cartSubtotalCents(itemsById, {
      lines: [sodaLine, { ...sodaLine, itemId: ids.unavailableItem }],
    });
    expect(bad).toEqual({
      error: { code: "item_unavailable", itemId: ids.unavailableItem },
      lineIndex: 1,
      ok: false,
    });

    expect(
      cartSubtotalCents(itemsById, { lines: [{ ...sodaLine, itemId: ids.category }] }),
    ).toEqual({
      error: { code: "item_not_found", itemId: ids.category },
      lineIndex: 0,
      ok: false,
    });
    expect(cartSubtotalCents(itemsById, { lines: [] })).toEqual({
      lines: [],
      ok: true,
      subtotalCents: 0,
    });
  });
});

describe("mutações puras do carrinho", () => {
  it("cartSchema reidrata o carrinho do localStorage", () => {
    const cart = { lines: [validBurgerLine], storeSlug: "Lanchonete-do-Ze" };
    const parsed = cartSchema.parse(cart);
    expect(parsed.storeSlug).toBe("lanchonete-do-ze");
    expect(
      cartSchema.safeParse({ lines: [{ ...sodaLine, quantity: 0 }], storeSlug: "x" }).success,
    ).toBe(false);
    expect(cartSchema.safeParse({ lines: [], storeSlug: "" }).success).toBe(false);
  });

  it("carrinho é de uma única Loja", () => {
    expect(assertSingleStore(null, "a")).toEqual({ ok: true });
    expect(assertSingleStore(createEmptyCart("a"), "b")).toEqual({ ok: true });
    const cart = addCartLine(createEmptyCart("a"), sodaLine);
    expect(assertSingleStore(cart, "a")).toEqual({ ok: true });
    expect(assertSingleStore(cart, "b")).toEqual({ error: "store_mismatch", ok: false });
  });

  it("mesma escolha soma quantidade; escolha diferente vira linha nova", () => {
    let cart = addCartLine(createEmptyCart("a"), validBurgerLine);
    cart = addCartLine(cart, {
      ...validBurgerLine,
      additionalIds: [...validBurgerLine.additionalIds],
      complementSelections: {
        [ids.groupSauces]: [ids.optionSauceMayo, ids.optionSauceBbq],
        [ids.groupSteak]: [ids.optionSteakMedium],
        [ids.groupBread]: [],
      },
      quantity: 1,
    });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(3);

    cart = addCartLine(cart, { ...validBurgerLine, additionalIds: [] });
    expect(cart.lines).toHaveLength(2);

    cart = addCartLine(cart, { ...validBurgerLine, quantity: MAX_LINE_QUANTITY });
    expect(cart.lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("sameLineChoices ignora ordem e grupos vazios", () => {
    expect(
      sameLineChoices(validBurgerLine, {
        ...validBurgerLine,
        complementSelections: { ...validBurgerLine.complementSelections, [ids.groupBread]: [] },
      }),
    ).toBe(true);
    expect(sameLineChoices(validBurgerLine, { ...validBurgerLine, itemId: ids.soda })).toBe(false);
    expect(
      sameLineChoices(validBurgerLine, {
        ...validBurgerLine,
        complementSelections: { [ids.groupSteak]: [ids.optionSteakRare] },
      }),
    ).toBe(false);
  });

  it("setCartLineQuantity troca, remove com 0 e ignora entrada inválida", () => {
    const cart = addCartLine(addCartLine(createEmptyCart("a"), validBurgerLine), sodaLine);
    expect(setCartLineQuantity(cart, 1, 5).lines[1]?.quantity).toBe(5);
    expect(setCartLineQuantity(cart, 0, 0).lines).toEqual([sodaLine]);
    expect(setCartLineQuantity(cart, 7, 1)).toBe(cart);
    expect(setCartLineQuantity(cart, 0, 1.5)).toBe(cart);
    expect(setCartLineQuantity(cart, 0, MAX_LINE_QUANTITY + 1)).toBe(cart);
    expect(cart.lines).toHaveLength(2);
  });
});
