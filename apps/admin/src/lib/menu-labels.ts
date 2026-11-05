// Rótulos PT-BR do Cardápio (Ticket 23), com a grafia do glossário. Puro.
import { MAX_FEATURED_ITEMS } from "@foode/shared/menu";

/** Rótulo de ESTADO da disponibilidade (CAR-02), nunca de ação. */
export const AVAILABILITY_LABEL = { available: "Disponível", unavailable: "Esgotado" } as const;

export function availabilityLabel(available: boolean): string {
  return available ? AVAILABILITY_LABEL.available : AVAILABILITY_LABEL.unavailable;
}

/** Frase-resumo do grupo (CAR-06): "O Consumidor escolhe de 1 a 2 opções". */
export function selectionSummary(minSelect: number, maxSelect: number): string {
  if (minSelect === 0 && maxSelect === 1) return "O Consumidor pode escolher 1 opção, se quiser.";
  if (minSelect === 0) return `O Consumidor pode escolher até ${maxSelect} opções, se quiser.`;
  if (minSelect === maxSelect) {
    return minSelect === 1
      ? "O Consumidor precisa escolher 1 opção."
      : `O Consumidor precisa escolher ${minSelect} opções.`;
  }
  return `O Consumidor escolhe de ${minSelect} a ${maxSelect} opções.`;
}

/** Contador de Destaques e aviso quando o teto foi atingido (P-5.5). */
export function featuredHint(featuredCount: number, isFeatured: boolean): string {
  const others = isFeatured ? featuredCount - 1 : featuredCount;
  if (others >= MAX_FEATURED_ITEMS) {
    return `A Loja já tem ${MAX_FEATURED_ITEMS} Destaques. Para marcar este item, tire outro dos Destaques.`;
  }
  return `Destaques: ${others} de ${MAX_FEATURED_ITEMS}. Itens em destaque aparecem no topo do Storefront.`;
}

export function featuredFull(featuredCount: number, isFeatured: boolean): boolean {
  return (isFeatured ? featuredCount - 1 : featuredCount) >= MAX_FEATURED_ITEMS;
}

export const MENU_CONFLICT_MESSAGES = {
  featured: `A Loja já tem ${MAX_FEATURED_ITEMS} Destaques. Tire um item dos Destaques para marcar este.`,
  reorder: "A ordem mudou em outra aba. Recarregue a página e tente de novo.",
  categoryHasItems: "Esta categoria ainda tem itens. Mova ou apague os itens antes de apagá-la.",
  tooManyAdditionals: "Este item já tem o máximo de Adicionais.",
} as const;

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Valor do seletor de categoria do item que pede "nova categoria" (com `newCategoryName`). */
export const NEW_CATEGORY = "nova";
