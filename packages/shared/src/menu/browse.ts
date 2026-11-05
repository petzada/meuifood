// Navegação do Cardápio no Storefront, pura e sem rede (decisão 63): Destaques (P-5.5), busca
// filtrada no navegador (P-1.4) e link de compartilhar item (P-5.4). A `api` não tem rota de
// busca: o Cardápio inteiro já chega em `publicMenuSchema`.
import { MAX_FEATURED_ITEMS, type MenuCategory, type MenuItem, type PublicMenu } from "./schema.js";

/**
 * Itens do carrossel de Destaques: marcados pelo Dono e disponíveis, na ordem do Cardápio,
 * no máximo MAX_FEATURED_ITEMS. Sem destaque disponível = carrossel não aparece.
 */
export function featuredItems(menu: Pick<PublicMenu, "categories">): MenuItem[] {
  return menu.categories
    .flatMap((category) => category.items)
    .filter((item) => item.featured && item.available)
    .slice(0, MAX_FEATURED_ITEMS);
}

/** Minúsculas, sem acento e com espaços colapsados: "Pão  de Queijo" → "pao de queijo". */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** Consulta mínima para filtrar (1 caractere filtraria quase tudo e pisca a lista). */
export const MENU_SEARCH_MIN_LENGTH = 2;

/**
 * Filtra o Cardápio pelo texto (nome ou descrição do item; todas as palavras precisam aparecer).
 * Mantém a ordem e só as categorias com resultado. Consulta curta devolve o Cardápio inteiro.
 */
export function searchMenu(categories: readonly MenuCategory[], query: string): MenuCategory[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.join(" ").length < MENU_SEARCH_MIN_LENGTH) return [...categories];
  const matches = (item: MenuItem) => {
    const haystack = normalizeSearchText(`${item.name} ${item.description}`);
    return terms.every((term) => haystack.includes(term));
  };
  return categories
    .map((category) => ({ ...category, items: category.items.filter(matches) }))
    .filter((category) => category.items.length > 0);
}

/** Parâmetro de busca que abre o item direto no Storefront (`/loja/{slug}?item={id}`). */
export const MENU_ITEM_SHARE_PARAM = "item";

/**
 * Caminho compartilhável de um item (Web Share / copiar link, P-5.4). O Storefront monta a URL
 * absoluta com a própria origem; o item abre por cima do Cardápio.
 */
export function menuItemSharePath(storeSlug: string, itemId: string): string {
  const params = new URLSearchParams({ [MENU_ITEM_SHARE_PARAM]: itemId });
  return `/loja/${encodeURIComponent(storeSlug)}?${params.toString()}`;
}
