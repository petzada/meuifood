import { describe, expect, it } from "vitest";

import { featuredItems, menuItemSharePath, normalizeSearchText, searchMenu } from "./browse.js";
import { burger, ids, publicMenu, soda, unavailableItem, uuid } from "./fixtures.js";
import { MAX_FEATURED_ITEMS } from "./schema.js";

describe("featuredItems (P-5.5)", () => {
  it("só destaques disponíveis, na ordem do Cardápio, até o teto", () => {
    expect(featuredItems(publicMenu).map((item) => item.id)).toEqual([ids.burger]);
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...soda,
      featured: true,
      id: uuid(`f${i}`),
    }));
    const items = [{ ...unavailableItem, featured: true }, ...many];
    const result = featuredItems({ categories: [{ id: ids.category, items, name: "x" }] });
    expect(result).toHaveLength(MAX_FEATURED_ITEMS);
    expect(result.every((item) => item.available)).toBe(true);
  });
});

describe("busca no Storefront (P-1.4)", () => {
  it("normaliza acento, caixa e espaços", () => {
    expect(normalizeSearchText("  Pão   de QUEIJO ")).toBe("pao de queijo");
  });

  it("filtra por nome ou descrição, todas as palavras, e some com categoria vazia", () => {
    expect(searchMenu(publicMenu.categories, "burg")[0]?.items).toEqual([burger]);
    expect(searchMenu(publicMenu.categories, "pao queijo")[0]?.items).toEqual([burger]);
    expect(searchMenu(publicMenu.categories, "pizza")).toEqual([]);
  });

  it("consulta curta devolve tudo", () => {
    expect(searchMenu(publicMenu.categories, " x ")).toEqual(publicMenu.categories);
  });
});

describe("compartilhar item (P-5.4)", () => {
  it("monta o caminho do Storefront com o item", () => {
    expect(menuItemSharePath("lanchonete-do-ze", ids.burger)).toBe(
      `/loja/lanchonete-do-ze?item=${ids.burger}`,
    );
  });
});
