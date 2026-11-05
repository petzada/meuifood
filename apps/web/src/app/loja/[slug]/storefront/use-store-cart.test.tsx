// Hook: o carrinho salvo sobrevive à hidratação, inclusive com o monta/desmonta do StrictMode
// (bug: o efeito de persistir rodava no mesmo commit do de hidratar, com o carrinho vazio, e
// apagava a chave antes da segunda leitura).
import { act, renderHook } from "@testing-library/react";
import type { Cart, CartLine } from "@foode/shared/menu";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cartStorageKey } from "./cart-store";
import { ids } from "./fixtures";
import { useStoreCart } from "./use-store-cart";

const slug = "lanchonete-do-ze";
const sodaLine: CartLine = {
  additionalIds: [],
  complementSelections: {},
  itemId: ids.soda,
  quantity: 1,
};
const saved: Cart = { lines: [sodaLine], storeSlug: slug };

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(cartStorageKey(slug), JSON.stringify(saved));
});

describe("useStoreCart", () => {
  it("mantém o carrinho salvo ao hidratar dentro do StrictMode", () => {
    const { result } = renderHook(() => useStoreCart(slug), { wrapper: StrictMode });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.cart).toEqual(saved);
    expect(JSON.parse(window.localStorage.getItem(cartStorageKey(slug)) ?? "null")).toEqual(saved);
  });

  it("nunca zera o localStorage durante a hidratação", () => {
    const removeItem = vi.spyOn(window.localStorage, "removeItem");
    renderHook(() => useStoreCart(slug), { wrapper: StrictMode });
    expect(removeItem).not.toHaveBeenCalled();
    removeItem.mockRestore();
  });

  it("persiste as mudanças depois de hidratado e remonta com elas", () => {
    const first = renderHook(() => useStoreCart(slug), { wrapper: StrictMode });
    act(() => first.result.current.dispatch({ line: { ...sodaLine, quantity: 2 }, type: "add" }));
    expect(first.result.current.cart.lines[0]?.quantity).toBe(3);
    first.unmount();

    const second = renderHook(() => useStoreCart(slug), { wrapper: StrictMode });
    expect(second.result.current.cart.lines[0]?.quantity).toBe(3);
  });
});
