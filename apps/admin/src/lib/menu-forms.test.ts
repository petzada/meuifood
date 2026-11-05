import { describe, expect, it } from "vitest";

import {
  checkMenuImageFile,
  moveId,
  parseCreateComplementGroup,
  parseCreateItem,
  parseReorderItems,
  parseSetItemPrice,
  parseUpdateComplementGroup,
} from "./menu-forms";
import { featuredHint, selectionSummary } from "./menu-labels";

const CAT = "3f2d8c1e-7a4b-4c0d-9e1f-2a3b4c5d6e7f";
const ITEM = "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

describe("moveId (CAR-04)", () => {
  it("troca com o vizinho e para nas pontas", () => {
    expect(moveId([A, B, C], B, "up")).toEqual([B, A, C]);
    expect(moveId([A, B, C], B, "down")).toEqual([A, C, B]);
    expect(moveId([A, B, C], A, "up")).toEqual([A, B, C]);
    expect(moveId([A, B, C], C, "down")).toEqual([A, B, C]);
    expect(moveId([A, B], "x", "up")).toEqual([A, B]);
  });

  it("a action manda o conjunto completo reordenado", () => {
    const parsed = parseReorderItems(
      form({ categoryId: CAT, orderedIds: [A, B, C], moveId: C, direction: "up" }),
    );
    expect(parsed).toEqual({ ok: true, data: { categoryId: CAT, orderedItemIds: [A, C, B] } });
  });
});

describe("item", () => {
  it("converte R$ com vírgula em centavos e checkbox ausente em false", () => {
    const parsed = parseCreateItem(
      form({ categoryId: CAT, name: " Misto Quente ", priceCents: "12,90", featured: "on" }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toMatchObject({
      name: "Misto Quente",
      priceCents: 1290,
      available: false,
      featured: true,
      imageObjectKey: null,
    });
  });

  it("preço inválido cai no campo certo, em PT-BR", () => {
    const parsed = parseSetItemPrice(form({ itemId: ITEM, priceCents: "12,999" }));
    expect(parsed).toEqual({
      ok: false,
      errors: { priceCents: "Informe o preço em R$ (ex.: 12,90)." },
    });
  });

  it("nome vazio aponta o campo", () => {
    const parsed = parseCreateItem(form({ categoryId: CAT, name: "", priceCents: "5" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.name).toBe("Informe o nome (até 120 caracteres).");
  });
});

describe("grupo de Complemento (CAR-06, P-1.1)", () => {
  it("lê opções por índice, ignora linha vazia e usa 0 para acréscimo em branco", () => {
    const parsed = parseCreateComplementGroup(
      form({
        itemId: ITEM,
        name: "Ponto",
        minSelect: "1",
        maxSelect: "1",
        optionCount: "3",
        "options.0.name": "Ao ponto",
        "options.0.priceCents": "",
        "options.1.name": "Borda",
        "options.1.priceCents": "9,90",
        "options.2.name": "",
        "options.2.priceCents": "",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.options).toEqual([
      { name: "Ao ponto", priceCents: 0 },
      { name: "Borda", priceCents: 990 },
    ]);
  });

  it("mínimo maior que máximo vira erro no campo, em PT-BR", () => {
    const parsed = parseCreateComplementGroup(
      form({
        itemId: ITEM,
        name: "Ponto",
        minSelect: "2",
        maxSelect: "1",
        optionCount: "2",
        "options.0.name": "A",
        "options.1.name": "B",
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.minSelect).toBe("O mínimo não pode ser maior que o máximo.");
  });

  it("edição mantém o id da opção existente e cria a nova", () => {
    const parsed = parseUpdateComplementGroup(
      form({
        groupId: A,
        name: "Ponto",
        minSelect: "0",
        maxSelect: "2",
        optionCount: "2",
        "options.0.id": B,
        "options.0.name": "Ao ponto",
        "options.1.name": "Bem passado",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.options).toEqual([
      { id: B, name: "Ao ponto", priceCents: 0 },
      { name: "Bem passado", priceCents: 0 },
    ]);
  });

  it("frase-resumo como o Consumidor lê", () => {
    expect(selectionSummary(0, 1)).toBe("O Consumidor pode escolher 1 opção, se quiser.");
    expect(selectionSummary(1, 1)).toBe("O Consumidor precisa escolher 1 opção.");
    expect(selectionSummary(1, 2)).toBe("O Consumidor escolhe de 1 a 2 opções.");
    expect(selectionSummary(0, 3)).toBe("O Consumidor pode escolher até 3 opções, se quiser.");
  });
});

describe("foto (CAR-07) e Destaques (P-5.5)", () => {
  it("recusa tipo e tamanho antes do envio", () => {
    expect(checkMenuImageFile({ size: 10, type: "image/gif" }).ok).toBe(false);
    expect(checkMenuImageFile({ size: 5 * 1024 * 1024 + 1, type: "image/png" }).ok).toBe(false);
    expect(checkMenuImageFile({ size: 10, type: "image/webp" })).toEqual({
      ok: true,
      contentType: "image/webp",
    });
  });

  it("avisa quando já há 4 Destaques, sem contar o próprio item", () => {
    expect(featuredHint(4, false)).toMatch(/já tem 4 Destaques/);
    expect(featuredHint(4, true)).toMatch(/Destaques: 3 de 4/);
    expect(featuredHint(2, false)).toMatch(/Destaques: 2 de 4/);
  });
});
