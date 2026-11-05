// Escolhas do Consumidor dentro de um item (Complementos, Adicionais, quantidade), puras e
// testáveis sem DOM. A sheet do item só renderiza o que este módulo deriva: instrução e
// contador de cada grupo (I2), rótulo do CTA que diz o que falta (G2/I5) e total ao vivo.
import {
  lineUnitCents,
  MAX_LINE_QUANTITY,
  validateCartLine,
  type CartLine,
  type ComplementGroup,
  type MenuItem,
} from "@foode/shared/menu";
import { formatBRL, multiplyCents } from "@foode/shared/money";

export type ItemSelection = {
  additionalIds: string[];
  complementSelections: Record<string, string[]>;
  quantity: number;
};

export function emptySelection(): ItemSelection {
  return { additionalIds: [], complementSelections: {}, quantity: 1 };
}

/** Reabre o item com as escolhas de uma linha do carrinho (K2 "Editar"). */
export function selectionFromLine(line: CartLine): ItemSelection {
  return {
    additionalIds: [...line.additionalIds],
    complementSelections: Object.fromEntries(
      Object.entries(line.complementSelections).map(([groupId, ids]) => [groupId, [...ids]]),
    ),
    quantity: line.quantity,
  };
}

export function toCartLine(itemId: string, selection: ItemSelection): CartLine {
  return {
    additionalIds: selection.additionalIds,
    complementSelections: Object.fromEntries(
      Object.entries(selection.complementSelections).filter(([, ids]) => ids.length > 0),
    ),
    itemId,
    quantity: selection.quantity,
  };
}

/**
 * Marca/desmarca uma opção. Grupo de escolha única troca a opção; múltipla alterna e
 * ignora cliques acima de `maxSelect` (a UI já desabilita as restantes, I2).
 */
export function toggleOption(
  selection: ItemSelection,
  group: ComplementGroup,
  optionId: string,
): ItemSelection {
  const current = selection.complementSelections[group.id] ?? [];
  let next: string[];
  if (group.maxSelect === 1) {
    next = current.includes(optionId) && group.minSelect === 0 ? [] : [optionId];
  } else if (current.includes(optionId)) {
    next = current.filter((id) => id !== optionId);
  } else if (current.length >= group.maxSelect) {
    return selection;
  } else {
    next = [...current, optionId];
  }
  return {
    ...selection,
    complementSelections: { ...selection.complementSelections, [group.id]: next },
  };
}

export function toggleAdditional(selection: ItemSelection, additionalId: string): ItemSelection {
  const additionalIds = selection.additionalIds.includes(additionalId)
    ? selection.additionalIds.filter((id) => id !== additionalId)
    : [...selection.additionalIds, additionalId];
  return { ...selection, additionalIds };
}

export function setQuantity(selection: ItemSelection, quantity: number): ItemSelection {
  if (!Number.isInteger(quantity)) return selection;
  return { ...selection, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, quantity)) };
}

/** "Escolha 1" · "Escolha até 2" · "Escolha de 1 a 3" · "Escolha 2" (I2). */
export function groupInstruction(group: Pick<ComplementGroup, "maxSelect" | "minSelect">): string {
  if (group.minSelect === 0) {
    return group.maxSelect === 1 ? "Escolha até 1" : `Escolha até ${group.maxSelect}`;
  }
  if (group.minSelect === group.maxSelect) return `Escolha ${group.minSelect}`;
  return `Escolha de ${group.minSelect} a ${group.maxSelect}`;
}

export type GroupStatus = {
  atMax: boolean;
  /** "0/1", "1/2" — contador anunciado em `aria-live` (I2). */
  counter: string;
  instruction: string;
  pending: boolean;
  required: boolean;
  selected: number;
};

export function groupStatus(group: ComplementGroup, selection: ItemSelection): GroupStatus {
  const selected = selection.complementSelections[group.id]?.length ?? 0;
  return {
    atMax: selected >= group.maxSelect,
    counter: `${selected}/${group.maxSelect}`,
    instruction: groupInstruction(group),
    pending: selected < group.minSelect,
    required: group.minSelect >= 1,
    selected,
  };
}

/** Primeiro grupo obrigatório ainda incompleto, na ordem do Cardápio. */
export function firstPendingGroup(
  item: MenuItem,
  selection: ItemSelection,
): ComplementGroup | null {
  return item.complementGroups.find((group) => groupStatus(group, selection).pending) ?? null;
}

/** Preço unitário com as escolhas até agora (soma o que já está marcado, mesmo pendente). */
export function selectionUnitCents(item: MenuItem, selection: ItemSelection): number {
  return lineUnitCents(item, {
    additionalIds: selection.additionalIds.filter((id) =>
      item.additionals.some((additional) => additional.id === id),
    ),
    complementSelections: Object.fromEntries(
      item.complementGroups.map((group) => [
        group.id,
        (selection.complementSelections[group.id] ?? []).filter((optionId) =>
          group.options.some((option) => option.id === optionId),
        ),
      ]),
    ),
  });
}

export type SelectionCta =
  | { kind: "ready"; label: string; totalCents: number }
  | { kind: "pending"; label: string; groupId: string }
  | { kind: "unavailable"; label: string };

/**
 * Rótulo do CTA (G1/G2): "Adicionar · R$ 25,00" quando dá para adicionar; "Escolha {grupo}"
 * enquanto faltar obrigatório — o botão continua focável e leva até a pendência.
 */
export function selectionCta(
  item: MenuItem,
  selection: ItemSelection,
  verb = "Adicionar",
): SelectionCta {
  if (!item.available) return { kind: "unavailable", label: "Indisponível" };
  const pending = firstPendingGroup(item, selection);
  if (pending) return { groupId: pending.id, kind: "pending", label: `Escolha ${pending.name}` };
  const validation = validateCartLine(item, selection);
  if (!validation.ok) {
    return { kind: "pending", label: "Revise as escolhas", groupId: "" };
  }
  const totalCents = multiplyCents(selectionUnitCents(item, selection), selection.quantity);
  return { kind: "ready", label: `${verb} · ${formatBRL(totalCents)}`, totalCents };
}
