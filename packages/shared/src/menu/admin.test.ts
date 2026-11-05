import { describe, expect, it } from "vitest";

import {
  MENU_IMAGE_MAX_BYTES,
  isStoreMenuImageKey,
  menuCopyComplementGroupsInputSchema,
  menuCreateAdditionalInputSchema,
  menuCreateCategoryInputSchema,
  menuCreateComplementGroupInputSchema,
  menuCreateItemInputSchema,
  menuImageObjectKey,
  menuReorderCategoriesInputSchema,
  menuRequestImageUploadInputSchema,
  menuUpdateAdditionalInputSchema,
  menuUpdateCategoryInputSchema,
  menuUpdateComplementGroupInputSchema,
  menuUpdateItemInputSchema,
  publicMenuImageUrl,
} from "./admin.js";
import { burger, publicMenu, soda, uuid } from "./fixtures.js";
import { MAX_FEATURED_ITEMS, publicMenuSchema } from "./schema.js";

const storeId = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const otherStoreId = "5a1d3b9f-7b62-4d4c-8e1f-2c3d4e5f6a70";
const objectId = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c";

describe("categorias", () => {
  it("cria com disponível por padrão e rejeita nome vazio", () => {
    expect(menuCreateCategoryInputSchema.parse({ name: " Lanches " })).toEqual({
      available: true,
      name: "Lanches",
    });
    expect(menuCreateCategoryInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("update exige ao menos um campo e aceita disponibilidade inline (CAR-02)", () => {
    expect(menuUpdateCategoryInputSchema.safeParse({ categoryId: uuid("c1") }).success).toBe(false);
    expect(
      menuUpdateCategoryInputSchema.safeParse({ available: false, categoryId: uuid("c1") }).success,
    ).toBe(true);
  });

  it("reordenar recusa id repetido e lista vazia", () => {
    expect(menuReorderCategoriesInputSchema.safeParse({ orderedCategoryIds: [] }).success).toBe(
      false,
    );
    expect(
      menuReorderCategoriesInputSchema.safeParse({ orderedCategoryIds: [uuid("c1"), uuid("c1")] })
        .success,
    ).toBe(false);
  });

  it("não aceita storeId na entrada (a Loja vem da sessão)", () => {
    const parsed = menuCreateCategoryInputSchema.parse({ name: "Bebidas", storeId: otherStoreId });
    expect(parsed).not.toHaveProperty("storeId");
  });
});

describe("itens", () => {
  const base = { categoryId: uuid("c1"), name: "X-Burger", priceCents: 2500 };

  it("aplica padrões: disponível, sem destaque, sem foto, sem descrição", () => {
    expect(menuCreateItemInputSchema.parse(base)).toEqual({
      ...base,
      available: true,
      description: "",
      featured: false,
      imageObjectKey: null,
    });
  });

  it("preço em centavos inteiros não negativos", () => {
    for (const priceCents of [-1, 12.5, 100_000_001]) {
      expect(menuCreateItemInputSchema.safeParse({ ...base, priceCents }).success).toBe(false);
    }
  });

  it("preço inline (P-CAR-5) e destaque (P-5.5) são updates de um campo", () => {
    expect(
      menuUpdateItemInputSchema.safeParse({ itemId: uuid("d1"), priceCents: 2790 }).success,
    ).toBe(true);
    expect(
      menuUpdateItemInputSchema.safeParse({ featured: true, itemId: uuid("d1") }).success,
    ).toBe(true);
    expect(menuUpdateItemInputSchema.safeParse({ itemId: uuid("d1") }).success).toBe(false);
  });

  it("remover a foto é imageObjectKey null", () => {
    expect(menuUpdateItemInputSchema.parse({ imageObjectKey: null, itemId: uuid("d1") })).toEqual({
      imageObjectKey: null,
      itemId: uuid("d1"),
    });
  });
});

describe("grupos de Complemento", () => {
  const group = {
    itemId: uuid("d1"),
    maxSelect: 2,
    minSelect: 0,
    name: "Molhos",
    options: [{ name: "Barbecue", priceCents: 150 }, { name: "Maionese" }],
  };

  it("opção sem preço vale 0 (P-1.1)", () => {
    const parsed = menuCreateComplementGroupInputSchema.parse(group);
    expect(parsed.options).toEqual([
      { name: "Barbecue", priceCents: 150 },
      { name: "Maionese", priceCents: 0 },
    ]);
  });

  it("valida limites (CAR-06): mín ≤ máx, mín ≤ opções, máx ≥ 1", () => {
    const invalid = [
      { ...group, maxSelect: 1, minSelect: 2 },
      { ...group, maxSelect: 3, minSelect: 3 },
      { ...group, maxSelect: 0 },
      { ...group, options: [] },
      { ...group, options: [{ name: "x", priceCents: -1 }] },
    ];
    for (const input of invalid) {
      expect(menuCreateComplementGroupInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("update troca a lista completa de opções, sem id repetido", () => {
    const option = { id: uuid("71"), name: "Brioche", priceCents: 250 };
    expect(
      menuUpdateComplementGroupInputSchema.safeParse({
        groupId: uuid("61"),
        options: [option, { name: "Australiano" }],
      }).success,
    ).toBe(true);
    expect(
      menuUpdateComplementGroupInputSchema.safeParse({
        groupId: uuid("61"),
        options: [option, option],
      }).success,
    ).toBe(false);
    expect(menuUpdateComplementGroupInputSchema.safeParse({ groupId: uuid("61") }).success).toBe(
      false,
    );
    expect(
      menuUpdateComplementGroupInputSchema.safeParse({
        groupId: uuid("61"),
        maxSelect: 1,
        minSelect: 2,
      }).success,
    ).toBe(false);
  });

  it("copiar grupos (P-CAR-1) exige itens diferentes", () => {
    expect(
      menuCopyComplementGroupsInputSchema.safeParse({
        sourceItemId: uuid("d1"),
        targetItemId: uuid("d2"),
      }).success,
    ).toBe(true);
    expect(
      menuCopyComplementGroupsInputSchema.safeParse({
        sourceItemId: uuid("d1"),
        targetItemId: uuid("d1"),
      }).success,
    ).toBe(false);
    expect(
      menuCopyComplementGroupsInputSchema.safeParse({
        groupIds: [uuid("61"), uuid("61")],
        sourceItemId: uuid("d1"),
        targetItemId: uuid("d2"),
      }).success,
    ).toBe(false);
  });
});

describe("Adicionais", () => {
  it("preço obrigatório, disponível por padrão; update com ao menos um campo", () => {
    expect(
      menuCreateAdditionalInputSchema.parse({ itemId: uuid("d1"), name: "Bacon", priceCents: 300 }),
    ).toEqual({ available: true, itemId: uuid("d1"), name: "Bacon", priceCents: 300 });
    expect(
      menuCreateAdditionalInputSchema.safeParse({ itemId: uuid("d1"), name: "Bacon" }).success,
    ).toBe(false);
    expect(menuUpdateAdditionalInputSchema.safeParse({ additionalId: uuid("b1") }).success).toBe(
      false,
    );
  });
});

describe("imagem no R2", () => {
  it("aceita JPEG/PNG/WebP até 5 MiB", () => {
    expect(
      menuRequestImageUploadInputSchema.safeParse({
        contentLength: MENU_IMAGE_MAX_BYTES,
        contentType: "image/webp",
      }).success,
    ).toBe(true);
    for (const input of [
      { contentLength: MENU_IMAGE_MAX_BYTES + 1, contentType: "image/png" },
      { contentLength: 0, contentType: "image/png" },
      { contentLength: 1000, contentType: "image/gif" },
      { contentLength: 1000, contentType: "image/svg+xml" },
    ]) {
      expect(menuRequestImageUploadInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("chave gerada no prefixo da Loja e reconhecida só para ela", () => {
    const key = menuImageObjectKey(storeId, "image/jpeg", objectId);
    expect(key).toBe(`stores/${storeId}/menu/${objectId}.jpg`);
    expect(isStoreMenuImageKey(storeId, key)).toBe(true);
    expect(isStoreMenuImageKey(otherStoreId, key)).toBe(false);
    expect(isStoreMenuImageKey(storeId, `stores/${storeId}/menu/../${objectId}.jpg`)).toBe(false);
    expect(isStoreMenuImageKey(storeId, `stores/${storeId}/menu/${objectId}.gif`)).toBe(false);
  });

  it("URL pública sem barra dupla", () => {
    expect(publicMenuImageUrl("https://media.example.com/", "stores/a/menu/b.png")).toBe(
      "https://media.example.com/stores/a/menu/b.png",
    );
  });
});

describe("Destaques no contrato público (P-5.5)", () => {
  it(`aceita até ${MAX_FEATURED_ITEMS} e rejeita o excedente`, () => {
    const featured = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...soda, featured: true, id: uuid(`e${i}`) }));
    const menuWith = (n: number) => ({
      ...publicMenu,
      categories: [{ ...publicMenu.categories[0]!, items: featured(n) }],
    });
    expect(publicMenuSchema.safeParse(menuWith(MAX_FEATURED_ITEMS)).success).toBe(true);
    expect(publicMenuSchema.safeParse(menuWith(MAX_FEATURED_ITEMS + 1)).success).toBe(false);
    expect(burger.featured).toBe(true);
  });
});
