// Estado do carrinho do Storefront separado da apresentação (critério 20.2): persistência
// por Loja no `localStorage`, reducer das ações e descrição das escolhas. Puro: nenhuma
// referência a DOM; o hook `use-store-cart.ts` liga este módulo ao navegador.
import {
  addCartLine,
  assertSingleStore,
  cartSchema,
  createEmptyCart,
  lineSubtotalCents,
  setCartLineQuantity,
  validateCartLine,
  type Cart,
  type CartLine,
  type CartLineError,
  type MenuItem,
} from "@foode/shared/menu";
import { formatBRL } from "@foode/shared/money";

/** Uma chave por Loja: trocar de Loja nunca mistura carrinhos (K5). */
export function cartStorageKey(storeSlug: string): string {
  return `foode:cart:${storeSlug}`;
}

export type CartStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Lê o carrinho salvo; conteúdo inválido ou de outra Loja vira carrinho vazio. */
export function readStoredCart(storage: CartStorage, storeSlug: string): Cart {
  const empty = createEmptyCart(storeSlug);
  const raw = storage.getItem(cartStorageKey(storeSlug));
  if (!raw) return empty;
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return empty;
    const single = assertSingleStore(parsed.data, storeSlug);
    return single.ok ? parsed.data : empty;
  } catch {
    return empty;
  }
}

export function writeStoredCart(storage: CartStorage, cart: Cart): void {
  const key = cartStorageKey(cart.storeSlug);
  if (cart.lines.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(cart));
}

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "clear" }
  /** Carrinho lido do `localStorage` depois da hidratação; só vale se for da mesma Loja. */
  | { type: "hydrate"; cart: Cart }
  | { type: "remove"; lineIndex: number }
  /** Edição pelo carrinho (K2): a linha é substituída, não somada. */
  | { type: "replace"; lineIndex: number; line: CartLine }
  /** "Desfazer" de uma remoção: a linha volta à posição original. */
  | { type: "restore"; lineIndex: number; line: CartLine }
  | { type: "set_quantity"; lineIndex: number; quantity: number };

export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "add":
      return addCartLine(cart, action.line);
    case "clear":
      return createEmptyCart(cart.storeSlug);
    case "hydrate":
      return assertSingleStore(action.cart, cart.storeSlug).ok ? action.cart : cart;
    case "remove":
      return setCartLineQuantity(cart, action.lineIndex, 0);
    case "replace": {
      if (action.lineIndex < 0 || action.lineIndex >= cart.lines.length) return cart;
      const lines = cart.lines.map((line, i) => (i === action.lineIndex ? action.line : line));
      return { ...cart, lines };
    }
    case "restore": {
      const at = Math.max(0, Math.min(action.lineIndex, cart.lines.length));
      const lines = [...cart.lines.slice(0, at), action.line, ...cart.lines.slice(at)];
      return { ...cart, lines };
    }
    case "set_quantity":
      return setCartLineQuantity(cart, action.lineIndex, action.quantity);
  }
}

/** Unidades no carrinho ("2 itens" na barra K1). */
export function cartItemCount(cart: Pick<Cart, "lines">): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

export type CartLineView = {
  error: CartLineError | null;
  item: MenuItem | undefined;
  line: CartLine;
  lineIndex: number;
  subtotalCents: number | null;
};

export type CartSummary = {
  /** Soma só das linhas válidas; a api recalcula e é a fonte de verdade (G7). */
  subtotalCents: number;
  hasInvalidLines: boolean;
  lines: CartLineView[];
};

/** Avalia cada linha contra o Cardápio atual (K4: linha inválida fica destacada). */
export function summarizeCart(itemsById: ReadonlyMap<string, MenuItem>, cart: Cart): CartSummary {
  const lines = cart.lines.map((line, lineIndex): CartLineView => {
    const item = itemsById.get(line.itemId);
    const validation = validateCartLine(item, line, line.itemId);
    return {
      error: validation.ok ? null : validation.error,
      item,
      line,
      lineIndex,
      subtotalCents: lineSubtotalCents(item, line),
    };
  });
  return {
    hasInvalidLines: lines.some((line) => line.error !== null),
    lines,
    subtotalCents: lines.reduce((total, line) => total + (line.subtotalCents ?? 0), 0),
  };
}

/**
 * Escolhas da linha para leitura humana (K2): "Pão: Brioche +R$ 2,50", "Bacon +R$ 3,00".
 * Ignora ids que não existem mais no item (a validação é quem acusa).
 */
export function describeLineChoices(
  item: MenuItem,
  line: Pick<CartLine, "additionalIds" | "complementSelections">,
): string[] {
  const choices: string[] = [];
  for (const group of item.complementGroups) {
    const optionIds = line.complementSelections[group.id] ?? [];
    for (const optionId of optionIds) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) continue;
      const price = option.priceCents > 0 ? ` +${formatBRL(option.priceCents)}` : "";
      choices.push(`${group.name}: ${option.name}${price}`);
    }
  }
  for (const additionalId of line.additionalIds) {
    const additional = item.additionals.find((candidate) => candidate.id === additionalId);
    if (!additional) continue;
    choices.push(`${additional.name} +${formatBRL(additional.priceCents)}`);
  }
  return choices;
}
