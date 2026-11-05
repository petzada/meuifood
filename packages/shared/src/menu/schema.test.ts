import { describe, expect, it } from "vitest";

import {
  complementGroupSchema,
  indexMenuItems,
  menuItemSchema,
  publicMenuSchema,
  selectionBoundsFromRequired,
  storeSlugSchema,
} from "./schema.js";
import { burger, publicMenu, uuid } from "./fixtures.js";

describe("publicMenuSchema", () => {
  it("parseia o Cardápio público e devolve o mesmo shape", () => {
    const parsed = publicMenuSchema.parse(publicMenu);
    expect(parsed).toEqual(publicMenu);
    expect(indexMenuItems(parsed).get(burger.id)?.name).toBe("X-Burger");
  });

  it("normaliza o slug e rejeita slug inválido", () => {
    expect(storeSlugSchema.parse("  Lanchonete-Do-Ze ")).toBe("lanchonete-do-ze");
    for (const slug of ["", "-abc", "abc-", "a b", "loja_1", "ção"]) {
      expect(storeSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("exige preço em centavos inteiros e imagem como URL ou null", () => {
    expect(menuItemSchema.safeParse({ ...burger, priceCents: 25.5 }).success).toBe(false);
    expect(menuItemSchema.safeParse({ ...burger, priceCents: -1 }).success).toBe(false);
    expect(menuItemSchema.safeParse({ ...burger, imageUrl: "foto.png" }).success).toBe(false);
    expect(menuItemSchema.safeParse({ ...burger, imageUrl: null }).success).toBe(true);
  });

  it("mantém available no Adicional e no item (20.3)", () => {
    const withoutAvailable: Record<string, unknown> = { ...burger.additionals[0] };
    delete withoutAvailable.available;
    expect(menuItemSchema.safeParse({ ...burger, additionals: [withoutAvailable] }).success).toBe(
      false,
    );
    const itemWithoutAvailable: Record<string, unknown> = { ...burger };
    delete itemWithoutAvailable.available;
    expect(menuItemSchema.safeParse(itemWithoutAvailable).success).toBe(false);
  });

  it("rejeita ids duplicados de grupo e de Adicional no item", () => {
    const group = burger.complementGroups[0]!;
    expect(menuItemSchema.safeParse({ ...burger, complementGroups: [group, group] }).success).toBe(
      false,
    );
    const additional = burger.additionals[0]!;
    expect(
      menuItemSchema.safeParse({ ...burger, additionals: [additional, additional] }).success,
    ).toBe(false);
  });
});

describe("complementGroupSchema", () => {
  const base = {
    id: uuid("a1"),
    name: "Ponto da carne",
    options: [
      { id: uuid("a2"), name: "Mal passado" },
      { id: uuid("a3"), name: "Ao ponto" },
    ],
  };

  it("aceita min/max coerentes", () => {
    expect(complementGroupSchema.safeParse({ ...base, maxSelect: 1, minSelect: 1 }).success).toBe(
      true,
    );
    expect(complementGroupSchema.safeParse({ ...base, maxSelect: 2, minSelect: 0 }).success).toBe(
      true,
    );
  });

  it("rejeita min > max, min acima das opções, max 0 e opção duplicada", () => {
    expect(complementGroupSchema.safeParse({ ...base, maxSelect: 1, minSelect: 2 }).success).toBe(
      false,
    );
    expect(complementGroupSchema.safeParse({ ...base, maxSelect: 3, minSelect: 3 }).success).toBe(
      false,
    );
    expect(complementGroupSchema.safeParse({ ...base, maxSelect: 0, minSelect: 0 }).success).toBe(
      false,
    );
    expect(
      complementGroupSchema.safeParse({ ...base, options: [], maxSelect: 1, minSelect: 0 }).success,
    ).toBe(false);
    expect(
      complementGroupSchema.safeParse({
        ...base,
        maxSelect: 1,
        minSelect: 0,
        options: [base.options[0], base.options[0]],
      }).success,
    ).toBe(false);
  });

  it("traduz o required do legado", () => {
    expect(selectionBoundsFromRequired(true)).toEqual({ maxSelect: 1, minSelect: 1 });
    expect(selectionBoundsFromRequired(false)).toEqual({ maxSelect: 1, minSelect: 0 });
  });
});
