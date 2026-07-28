import { z } from "zod";

/** Referências canônicas para recálculo posterior no servidor (Ticket 08+). */
export const cartLineContractSchema = z.object({
  additionalIds: z.array(z.string().uuid()),
  complementSelections: z.record(z.string().uuid(), z.string().uuid()),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const cartContractSchema = z.object({
  lines: z.array(cartLineContractSchema),
  storeSlug: z.string().trim().min(1).max(80),
});

export type CartLineContract = z.infer<typeof cartLineContractSchema>;
export type CartContract = z.infer<typeof cartContractSchema>;

export type CatalogComplementOption = {
  id: string;
};

export type CatalogComplementGroup = {
  id: string;
  options: CatalogComplementOption[];
  required: boolean;
};

export type CatalogAdditional = {
  available: boolean;
  id: string;
  priceCents: number;
};

export type CatalogItemForCart = {
  additionals: CatalogAdditional[];
  complementGroups: CatalogComplementGroup[];
  id: string;
  priceCents: number;
};

export type LineValidationError =
  | "additional_unavailable"
  | "invalid_additional"
  | "invalid_complement_option"
  | "item_not_found"
  | "missing_required_complement"
  | "quantity_invalid";

export type LineValidationResult =
  | { ok: true }
  | { error: LineValidationError; ok: false };

/**
 * Valida escolhas do Consumidor contra o Cardápio.
 * Complemento obrigatório exige exatamente uma opção do grupo.
 */
export function validateCartLineChoices(
  item: CatalogItemForCart | undefined,
  line: Pick<
    CartLineContract,
    "additionalIds" | "complementSelections" | "quantity"
  >,
): LineValidationResult {
  if (!item) return { error: "item_not_found", ok: false };
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    return { error: "quantity_invalid", ok: false };
  }

  for (const group of item.complementGroups) {
    const selected = line.complementSelections[group.id];
    if (group.required) {
      if (!selected) {
        return { error: "missing_required_complement", ok: false };
      }
      if (!group.options.some((option) => option.id === selected)) {
        return { error: "invalid_complement_option", ok: false };
      }
    } else if (
      selected &&
      !group.options.some((option) => option.id === selected)
    ) {
      return { error: "invalid_complement_option", ok: false };
    }
  }

  for (const groupId of Object.keys(line.complementSelections)) {
    if (!item.complementGroups.some((group) => group.id === groupId)) {
      return { error: "invalid_complement_option", ok: false };
    }
  }

  if (new Set(line.additionalIds).size !== line.additionalIds.length) {
    return { error: "invalid_additional", ok: false };
  }

  for (const additionalId of line.additionalIds) {
    const additional = item.additionals.find(
      (candidate) => candidate.id === additionalId,
    );
    if (!additional) return { error: "invalid_additional", ok: false };
    if (!additional.available) {
      return { error: "additional_unavailable", ok: false };
    }
  }

  return { ok: true };
}

/**
 * Prévia determinística em centavos inteiros.
 * Não é autoridade de preço — o servidor recalcula no Pedido.
 */
export function previewLineTotalCents(
  item: CatalogItemForCart,
  line: Pick<
    CartLineContract,
    "additionalIds" | "complementSelections" | "quantity"
  >,
): number | null {
  const validation = validateCartLineChoices(item, line);
  if (!validation.ok) return null;

  let unitCents = item.priceCents;
  for (const additionalId of line.additionalIds) {
    const additional = item.additionals.find(
      (candidate) => candidate.id === additionalId,
    );
    if (!additional) return null;
    unitCents += additional.priceCents;
  }

  return unitCents * line.quantity;
}

export function previewCartTotalCents(
  catalogByItemId: Map<string, CatalogItemForCart>,
  cart: CartContract,
): number | null {
  let total = 0;
  for (const line of cart.lines) {
    const item = catalogByItemId.get(line.itemId);
    if (!item) return null;
    const lineTotal = previewLineTotalCents(item, line);
    if (lineTotal === null) return null;
    total += lineTotal;
  }
  return total;
}

/**
 * Carrinho pertence a uma única Loja/slug. Mistura → rejeição.
 */
export function assertSingleStoreCart(
  existing: CartContract | null,
  storeSlug: string,
): { ok: true } | { error: "store_mismatch"; ok: false } {
  if (!existing || existing.lines.length === 0) return { ok: true };
  if (existing.storeSlug !== storeSlug) {
    return { error: "store_mismatch", ok: false };
  }
  return { ok: true };
}

export function createEmptyCart(storeSlug: string): CartContract {
  return { lines: [], storeSlug };
}
