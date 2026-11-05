import { indexMenuItems, type Cart, type CartLine } from "@foode/shared/menu";
import { describe, expect, it } from "vitest";

import {
  cartItemCount,
  cartReducer,
  cartStorageKey,
  describeLineChoices,
  readStoredCart,
  summarizeCart,
  writeStoredCart,
  type CartStorage,
} from "./cart-store";
import { burger, ids, publicMenu } from "./fixtures";

function memoryStorage(
  initial: Record<string, string> = {},
): CartStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const burgerLine: CartLine = {
  additionalIds: [ids.additionalBacon],
  complementSelections: {
    [ids.groupSteak]: [ids.optionSteakMedium],
    [ids.groupBread]: [ids.optionBreadBrioche],
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

const empty: Cart = { lines: [], storeSlug: "lanchonete-do-ze" };

describe("persistência por Loja", () => {
  it("salva e lê o carrinho na chave da Loja", () => {
    const storage = memoryStorage();
    const cart: Cart = { lines: [sodaLine], storeSlug: "lanchonete-do-ze" };
    writeStoredCart(storage, cart);
    expect(storage.data.has(cartStorageKey("lanchonete-do-ze"))).toBe(true);
    expect(readStoredCart(storage, "lanchonete-do-ze")).toEqual(cart);
  });

  it("remove a chave quando o carrinho esvazia", () => {
    const storage = memoryStorage({ [cartStorageKey("lanchonete-do-ze")]: "{}" });
    writeStoredCart(storage, empty);
    expect(storage.data.size).toBe(0);
  });

  it("ignora conteúdo inválido ou de outra Loja", () => {
    const storage = memoryStorage({
      [cartStorageKey("lanchonete-do-ze")]: JSON.stringify({
        lines: [sodaLine],
        storeSlug: "outra",
      }),
      [cartStorageKey("quebrada")]: "{nope",
    });
    expect(readStoredCart(storage, "lanchonete-do-ze")).toEqual(empty);
    expect(readStoredCart(storage, "quebrada")).toEqual({ lines: [], storeSlug: "quebrada" });
  });
});

describe("cartReducer", () => {
  it("soma a mesma escolha e separa escolhas diferentes", () => {
    let cart = cartReducer(empty, { line: burgerLine, type: "add" });
    cart = cartReducer(cart, { line: { ...burgerLine, quantity: 1 }, type: "add" });
    cart = cartReducer(cart, { line: sodaLine, type: "add" });
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]?.quantity).toBe(3);
    expect(cartItemCount(cart)).toBe(4);
  });

  it("troca quantidade, remove em zero, restaura e substitui", () => {
    let cart = cartReducer(empty, { line: burgerLine, type: "add" });
    cart = cartReducer(cart, { line: sodaLine, type: "add" });
    cart = cartReducer(cart, { lineIndex: 0, quantity: 5, type: "set_quantity" });
    expect(cart.lines[0]?.quantity).toBe(5);

    const removed = cartReducer(cart, { lineIndex: 0, type: "remove" });
    expect(removed.lines.map((line) => line.itemId)).toEqual([ids.soda]);

    const restored = cartReducer(removed, { line: cart.lines[0]!, lineIndex: 0, type: "restore" });
    expect(restored.lines.map((line) => line.itemId)).toEqual([ids.burger, ids.soda]);

    const replaced = cartReducer(restored, {
      line: { ...burgerLine, additionalIds: [], quantity: 1 },
      lineIndex: 0,
      type: "replace",
    });
    expect(replaced.lines[0]).toEqual({ ...burgerLine, additionalIds: [], quantity: 1 });
    expect(cartReducer(replaced, { type: "clear" })).toEqual(empty);
  });

  it("hidrata só se o carrinho salvo for da mesma Loja", () => {
    const other: Cart = { lines: [sodaLine], storeSlug: "outra" };
    expect(cartReducer(empty, { cart: other, type: "hydrate" })).toEqual(empty);
    const same: Cart = { lines: [sodaLine], storeSlug: "lanchonete-do-ze" };
    expect(cartReducer(empty, { cart: same, type: "hydrate" })).toEqual(same);
  });
});

describe("summarizeCart e describeLineChoices", () => {
  const itemsById = indexMenuItems(publicMenu);

  it("soma linhas válidas com preço de opção e Adicional (P-1.1)", () => {
    const summary = summarizeCart(itemsById, {
      lines: [burgerLine, sodaLine],
      storeSlug: "lanchonete-do-ze",
    });
    // (2500 + 250 + 300) × 2 + 600
    expect(summary.subtotalCents).toBe(6700);
    expect(summary.hasInvalidLines).toBe(false);
    expect(describeLineChoices(burger, burgerLine)).toEqual([
      "Ponto da carne: Ao ponto",
      "Pão: Brioche +R$ 2,50",
      "Bacon +R$ 3,00",
    ]);
  });

  it("destaca linha inválida e não a soma (K4)", () => {
    const invalid: CartLine = { ...sodaLine, itemId: ids.unavailableItem };
    const missing: CartLine = { ...burgerLine, complementSelections: {} };
    const summary = summarizeCart(itemsById, {
      lines: [sodaLine, invalid, missing],
      storeSlug: "lanchonete-do-ze",
    });
    expect(summary.hasInvalidLines).toBe(true);
    expect(summary.lines[1]?.error?.code).toBe("item_unavailable");
    expect(summary.lines[2]?.error?.code).toBe("complement_too_few");
    expect(summary.subtotalCents).toBe(600);
  });
});
