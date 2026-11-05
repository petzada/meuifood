"use client";

// Liga o módulo puro `cart-store.ts` ao navegador: hidrata do `localStorage` depois do
// primeiro render (evita divergência de hidratação) e persiste a cada mudança.
import { createEmptyCart, type Cart } from "@foode/shared/menu";
import { useCallback, useEffect, useReducer, useState } from "react";

import { cartReducer, readStoredCart, writeStoredCart, type CartAction } from "./cart-store";

export function useStoreCart(storeSlug: string): {
  cart: Cart;
  dispatch: (action: CartAction) => void;
  hydrated: boolean;
} {
  const [cart, dispatch] = useReducer(cartReducer, storeSlug, createEmptyCart);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    dispatch({ cart: readStoredCart(window.localStorage, storeSlug), type: "hydrate" });
    setHydrated(true);
  }, [storeSlug]);

  // Persiste só a partir do render em que `hydrated` virou true: nesse render o `cart` já é o
  // lido do storage. Um ref marcado no efeito acima valeria ainda neste mesmo commit, com o
  // carrinho inicial vazio, e apagaria a chave (no StrictMode a segunda leitura vinha vazia).
  useEffect(() => {
    if (!hydrated) return;
    writeStoredCart(window.localStorage, cart);
  }, [cart, hydrated]);

  const safeDispatch = useCallback((action: CartAction) => dispatch(action), []);

  return { cart, dispatch: safeDispatch, hydrated };
}
