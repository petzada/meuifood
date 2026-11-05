// Carrinho do Consumidor sobre o contrato público do Cardápio. Puro: valida a seleção de
// Complementos (min/max por grupo) e Adicionais e calcula o subtotal em centavos inteiros,
// somando o preço das opções de Complemento escolhidas (decisão 63, P-1.1).
// Não é autoridade de preço: a `api` recalcula no Pedido com o mesmo módulo.
import { z } from "zod";

import { multiplyCents, sumCents } from "../money.js";
import { menuIdSchema, storeSlugSchema, type MenuItem } from "./schema.js";

export const MAX_LINE_QUANTITY = 99;

export const cartLineSchema = z.object({
  additionalIds: z.array(menuIdSchema).max(40),
  /** groupId → optionIds escolhidos (vazio ou ausente = nenhuma escolha no grupo). */
  complementSelections: z.record(menuIdSchema, z.array(menuIdSchema).max(40)),
  itemId: menuIdSchema,
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});

/** Teto de linhas num carrinho (protege o recálculo no servidor). */
export const MAX_CART_LINES = 50;

export const cartSchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_CART_LINES),
  storeSlug: storeSlugSchema,
});

/**
 * Corpo de `POST /storefront/lojas/:slug/carrinho` (recálculo no servidor). A Loja vem do Slug
 * na URL; o corpo não carrega `store_id` nem preço — só ids e quantidades.
 */
export const cartQuoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(MAX_CART_LINES),
});

export type CartQuoteRequest = z.infer<typeof cartQuoteRequestSchema>;

export type CartLine = z.infer<typeof cartLineSchema>;
export type Cart = z.infer<typeof cartSchema>;

export type CartLineError =
  | { code: "additional_unavailable"; additionalId: string }
  | { code: "complement_duplicate_option"; groupId: string }
  | { code: "complement_too_few"; groupId: string; minSelect: number; selected: number }
  | { code: "complement_too_many"; groupId: string; maxSelect: number; selected: number }
  | { code: "invalid_additional"; additionalId: string }
  | { code: "invalid_complement_group"; groupId: string }
  | { code: "invalid_complement_option"; groupId: string; optionId: string }
  | { code: "item_not_found"; itemId: string }
  | { code: "item_unavailable"; itemId: string }
  | { code: "quantity_invalid"; quantity: number };

export type CartLineErrorCode = CartLineError["code"];

export type CartLineValidation = { ok: true } | { error: CartLineError; ok: false };

type LineChoices = Pick<CartLine, "additionalIds" | "complementSelections" | "quantity">;

/** Mensagens em PT-BR para o Storefront; a `api` devolve só o `code`. */
export const cartLineErrorMessagePt: Record<CartLineErrorCode, string> = {
  additional_unavailable: "Um Adicional escolhido não está mais disponível.",
  complement_duplicate_option: "A mesma opção foi escolhida duas vezes.",
  complement_too_few: "Escolha as opções obrigatórias deste item.",
  complement_too_many: "Você escolheu mais opções do que este Complemento permite.",
  invalid_additional: "Um Adicional escolhido não existe mais neste item.",
  invalid_complement_group: "Um Complemento escolhido não existe mais neste item.",
  invalid_complement_option: "Uma opção escolhida não existe mais neste Complemento.",
  item_not_found: "Este item saiu do Cardápio.",
  item_unavailable: "Este item está indisponível no momento.",
  quantity_invalid: "Quantidade inválida.",
};

/**
 * Valida as escolhas de uma linha contra o item do Cardápio.
 * Cada grupo exige entre `minSelect` e `maxSelect` opções distintas e existentes.
 */
export function validateCartLine(
  item: MenuItem | undefined,
  line: LineChoices,
  itemId?: string,
): CartLineValidation {
  if (!item) return { error: { code: "item_not_found", itemId: itemId ?? "" }, ok: false };
  if (!item.available) return { error: { code: "item_unavailable", itemId: item.id }, ok: false };
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
    return { error: { code: "quantity_invalid", quantity: line.quantity }, ok: false };
  }

  const groupsById = new Map(item.complementGroups.map((group) => [group.id, group]));

  for (const groupId of Object.keys(line.complementSelections)) {
    if (!groupsById.has(groupId)) {
      return { error: { code: "invalid_complement_group", groupId }, ok: false };
    }
  }

  for (const group of item.complementGroups) {
    const selected = line.complementSelections[group.id] ?? [];
    if (new Set(selected).size !== selected.length) {
      return { error: { code: "complement_duplicate_option", groupId: group.id }, ok: false };
    }
    for (const optionId of selected) {
      if (!group.options.some((option) => option.id === optionId)) {
        return {
          error: { code: "invalid_complement_option", groupId: group.id, optionId },
          ok: false,
        };
      }
    }
    if (selected.length < group.minSelect) {
      return {
        error: {
          code: "complement_too_few",
          groupId: group.id,
          minSelect: group.minSelect,
          selected: selected.length,
        },
        ok: false,
      };
    }
    if (selected.length > group.maxSelect) {
      return {
        error: {
          code: "complement_too_many",
          groupId: group.id,
          maxSelect: group.maxSelect,
          selected: selected.length,
        },
        ok: false,
      };
    }
  }

  const seenAdditionals = new Set<string>();
  for (const additionalId of line.additionalIds) {
    if (seenAdditionals.has(additionalId)) {
      return { error: { code: "invalid_additional", additionalId }, ok: false };
    }
    seenAdditionals.add(additionalId);
    const additional = item.additionals.find((candidate) => candidate.id === additionalId);
    if (!additional) return { error: { code: "invalid_additional", additionalId }, ok: false };
    if (!additional.available) {
      return { error: { code: "additional_unavailable", additionalId }, ok: false };
    }
  }

  return { ok: true };
}

/**
 * Preço unitário da linha em centavos: item + opções de Complemento escolhidas (P-1.1, padrão 0)
 * + Adicionais. Pressupõe linha válida (`validateCartLine`); escolha que não pertence ao item é
 * erro de programação e lança.
 */
export function lineUnitCents(
  item: MenuItem,
  line: Pick<CartLine, "additionalIds" | "complementSelections">,
): number {
  const optionsCents: number[] = [];
  for (const [groupId, optionIds] of Object.entries(line.complementSelections)) {
    const group = item.complementGroups.find((candidate) => candidate.id === groupId);
    if (!group) throw new Error(`cart: grupo ${groupId} não pertence ao item ${item.id}`);
    for (const optionId of optionIds) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) throw new Error(`cart: opção ${optionId} não pertence ao grupo ${groupId}`);
      optionsCents.push(option.priceCents);
    }
  }
  const additionalsCents = line.additionalIds.map((additionalId) => {
    const additional = item.additionals.find((candidate) => candidate.id === additionalId);
    if (!additional)
      throw new Error(`cart: adicional ${additionalId} não pertence ao item ${item.id}`);
    return additional.priceCents;
  });
  return sumCents([item.priceCents, ...optionsCents, ...additionalsCents]);
}

/** Subtotal da linha, ou `null` se a linha não passa na validação. */
export function lineSubtotalCents(
  item: MenuItem | undefined,
  line: LineChoices & { itemId?: string },
): number | null {
  const validation = validateCartLine(item, line, line.itemId);
  if (!validation.ok || !item) return null;
  return multiplyCents(lineUnitCents(item, line), line.quantity);
}

export type CartSubtotal =
  | { ok: true; subtotalCents: number; lines: Array<{ itemId: string; subtotalCents: number }> }
  | { error: CartLineError; lineIndex: number; ok: false };

const cartLineErrorCodes = [
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
] as const satisfies readonly CartLineErrorCode[];

/**
 * Resposta do recálculo no servidor (= `CartSubtotal`). O Storefront parseia e, se `ok: false`,
 * marca a linha `lineIndex` com `cartLineErrorMessagePt[error.code]` (K4).
 */
const subtotalSchema = z.number().int().min(0);

export const cartQuoteResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    lines: z.array(z.object({ itemId: menuIdSchema, subtotalCents: subtotalSchema })),
    ok: z.literal(true),
    subtotalCents: subtotalSchema,
  }),
  z.object({
    error: z.looseObject({ code: z.enum(cartLineErrorCodes) }),
    lineIndex: z.number().int().min(0),
    ok: z.literal(false),
  }),
]);

/** Subtotal do carrinho inteiro; para na primeira linha inválida e diz qual. */
export function cartSubtotalCents(
  itemsById: ReadonlyMap<string, MenuItem>,
  cart: Pick<Cart, "lines">,
): CartSubtotal {
  const lines: Array<{ itemId: string; subtotalCents: number }> = [];
  for (const [lineIndex, line] of cart.lines.entries()) {
    const item = itemsById.get(line.itemId);
    const validation = validateCartLine(item, line, line.itemId);
    if (!validation.ok || !item) {
      const error = validation.ok
        ? ({ code: "item_not_found", itemId: line.itemId } as const)
        : validation.error;
      return { error, lineIndex, ok: false };
    }
    lines.push({
      itemId: line.itemId,
      subtotalCents: multiplyCents(lineUnitCents(item, line), line.quantity),
    });
  }
  return { lines, ok: true, subtotalCents: sumCents(lines.map((line) => line.subtotalCents)) };
}

/** Carrinho pertence a uma única Loja (Slug). Mistura → rejeição. */
export function assertSingleStore(
  existing: Cart | null,
  storeSlug: string,
): { ok: true } | { error: "store_mismatch"; ok: false } {
  if (!existing || existing.lines.length === 0) return { ok: true };
  return existing.storeSlug === storeSlug ? { ok: true } : { error: "store_mismatch", ok: false };
}

export function createEmptyCart(storeSlug: string): Cart {
  return { lines: [], storeSlug };
}

/** Duas linhas são a "mesma escolha" quando item, Complementos e Adicionais coincidem. */
export function sameLineChoices(
  a: Omit<CartLine, "quantity">,
  b: Omit<CartLine, "quantity">,
): boolean {
  if (a.itemId !== b.itemId) return false;
  const sortedAdditionals = (ids: string[]) => [...ids].sort().join(",");
  if (sortedAdditionals(a.additionalIds) !== sortedAdditionals(b.additionalIds)) return false;
  const normalize = (selections: CartLine["complementSelections"]) =>
    Object.entries(selections)
      .filter(([, ids]) => ids.length > 0)
      .map(([groupId, ids]) => `${groupId}:${sortedAdditionals(ids)}`)
      .sort()
      .join("|");
  return normalize(a.complementSelections) === normalize(b.complementSelections);
}

/** Adiciona uma linha; se já existe a mesma escolha, soma a quantidade (até o teto). */
export function addCartLine(cart: Cart, line: CartLine): Cart {
  const index = cart.lines.findIndex((existing) => sameLineChoices(existing, line));
  if (index === -1) return { ...cart, lines: [...cart.lines, line] };
  const lines = cart.lines.map((existing, i) =>
    i === index
      ? { ...existing, quantity: Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity) }
      : existing,
  );
  return { ...cart, lines };
}

/** Troca a quantidade de uma linha; 0 remove a linha. */
export function setCartLineQuantity(cart: Cart, lineIndex: number, quantity: number): Cart {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) return cart;
  if (lineIndex < 0 || lineIndex >= cart.lines.length) return cart;
  const lines =
    quantity === 0
      ? cart.lines.filter((_, i) => i !== lineIndex)
      : cart.lines.map((line, i) => (i === lineIndex ? { ...line, quantity } : line));
  return { ...cart, lines };
}
