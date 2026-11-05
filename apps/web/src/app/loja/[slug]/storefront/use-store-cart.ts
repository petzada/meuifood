"use client";

// Liga o módulo puro `cart-store.ts` ao navegador: hidrata do `localStorage` depois do
// primeiro render (evita divergência de hidratação) e persiste a cada mudança.
import { createEmptyCart, type Cart } from "@foode/shared/menu";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { cartReducer, readStoredCart, writeStoredCart, type CartAction } from "./cart-store";

export function useStoreCart(storeSlug: string): {
  cart: Cart;
  dispatch: (action: CartAction) => void;
  hydrated: boolean;
} {
  const [cart, dispatch] = useReducer(cartReducer, storeSlug, createEmptyCart);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    dispatch({ cart: readStoredCart(window.localStorage, storeSlug), type: "hydrate" });
    hydratedRef.current = true;
    setHydrated(true);
  }, [storeSlug]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeStoredCart(window.localStorage, cart);
  }, [cart]);

  const safeDispatch = useCallback((action: CartAction) => dispatch(action), []);

  return { cart, dispatch: safeDispatch, hydrated };
}
