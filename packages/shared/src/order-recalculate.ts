import {
  validateCartLineChoices,
  type CartLineContract,
} from "./cart-preview.js";

export type ComplementSnapshot = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
};

export type AdditionalSnapshot = {
  id: string;
  name: string;
  priceCents: number;
};

export type RecalculatedOrderLine = {
  additionalSnapshots: AdditionalSnapshot[];
  complementSnapshots: ComplementSnapshot[];
  itemName: string;
  lineTotalCents: number;
  menuItemId: string;
  quantity: number;
  unitPriceCents: number;
};

export type OrderRecalculationError =
  | "additional_unavailable"
  | "empty_cart"
  | "invalid_additional"
  | "invalid_complement_option"
  | "item_not_found"
  | "item_unavailable"
  | "missing_required_complement"
  | "quantity_invalid";

export type CatalogItemForOrder = {
  available: boolean;
  additionals: Array<{
    available: boolean;
    id: string;
    name: string;
    priceCents: number;
  }>;
  complementGroups: Array<{
    id: string;
    name: string;
    options: Array<{ id: string; name: string }>;
    required: boolean;
  }>;
  id: string;
  name: string;
  priceCents: number;
};

export type OrderRecalculationResult =
  | {
      ok: true;
      itemsTotalCents: number;
      lines: RecalculatedOrderLine[];
    }
  | { ok: false; error: OrderRecalculationError };

/**
 * Autoridade de preço: recalcula a partir das referências do carrinho.
 * Ignora quaisquer totais enviados pelo cliente.
 */
export function recalculateGuestPickupOrder(
  catalogByItemId: Map<string, CatalogItemForOrder>,
  lines: CartLineContract[],
): OrderRecalculationResult {
  if (lines.length === 0) return { ok: false, error: "empty_cart" };

  const recalculated: RecalculatedOrderLine[] = [];
  let itemsTotalCents = 0;

  for (const line of lines) {
    const item = catalogByItemId.get(line.itemId);
    if (!item) return { ok: false, error: "item_not_found" };
    if (!item.available) return { ok: false, error: "item_unavailable" };

    const validation = validateCartLineChoices(item, line);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    let unitPriceCents = item.priceCents;
    const complementSnapshots: ComplementSnapshot[] = [];
    for (const group of item.complementGroups) {
      const optionId = line.complementSelections[group.id];
      if (!optionId) continue;
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) return { ok: false, error: "invalid_complement_option" };
      complementSnapshots.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
      });
    }

    const additionalSnapshots: AdditionalSnapshot[] = [];
    for (const additionalId of line.additionalIds) {
      const additional = item.additionals.find(
        (candidate) => candidate.id === additionalId,
      );
      if (!additional) return { ok: false, error: "invalid_additional" };
      if (!additional.available) {
        return { ok: false, error: "additional_unavailable" };
      }
      unitPriceCents += additional.priceCents;
      additionalSnapshots.push({
        id: additional.id,
        name: additional.name,
        priceCents: additional.priceCents,
      });
    }

    const lineTotalCents = unitPriceCents * line.quantity;
    itemsTotalCents += lineTotalCents;
    recalculated.push({
      additionalSnapshots,
      complementSnapshots,
      itemName: item.name,
      lineTotalCents,
      menuItemId: item.id,
      quantity: line.quantity,
      unitPriceCents,
    });
  }

  return { ok: true, itemsTotalCents, lines: recalculated };
}
