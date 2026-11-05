import { describe, expect, it } from "vitest";

import { burger, ids, soda, unavailableItem } from "./fixtures";
import {
  emptySelection,
  firstPendingGroup,
  groupInstruction,
  groupStatus,
  selectionCta,
  selectionFromLine,
  setQuantity,
  toCartLine,
  toggleAdditional,
  toggleOption,
} from "./item-selection";

const steak = burger.complementGroups[0]!;
const bread = burger.complementGroups[1]!;
const sauces = burger.complementGroups[2]!;

describe("instrução e contador do grupo (I2)", () => {
  it("deriva a instrução de minSelect/maxSelect", () => {
    expect(groupInstruction({ maxSelect: 1, minSelect: 1 })).toBe("Escolha 1");
    expect(groupInstruction({ maxSelect: 2, minSelect: 0 })).toBe("Escolha até 2");
    expect(groupInstruction({ maxSelect: 3, minSelect: 1 })).toBe("Escolha de 1 a 3");
    expect(groupInstruction({ maxSelect: 2, minSelect: 2 })).toBe("Escolha 2");
  });

  it("marca obrigatório, pendência e máximo", () => {
    const start = groupStatus(steak, emptySelection());
    expect(start).toMatchObject({ counter: "0/1", pending: true, required: true });
    const chosen = toggleOption(emptySelection(), steak, ids.optionSteakRare);
    expect(groupStatus(steak, chosen)).toMatchObject({
      atMax: true,
      counter: "1/1",
      pending: false,
    });
    expect(groupStatus(bread, chosen)).toMatchObject({ pending: false, required: false });
  });
});

describe("toggleOption", () => {
  it("escolha única troca a opção; opcional desmarca ao repetir", () => {
    let selection = toggleOption(emptySelection(), steak, ids.optionSteakRare);
    selection = toggleOption(selection, steak, ids.optionSteakMedium);
    expect(selection.complementSelections[steak.id]).toEqual([ids.optionSteakMedium]);
    // Obrigatório não desmarca ao repetir.
    selection = toggleOption(selection, steak, ids.optionSteakMedium);
    expect(selection.complementSelections[steak.id]).toEqual([ids.optionSteakMedium]);
    selection = toggleOption(selection, bread, ids.optionBreadBrioche);
    selection = toggleOption(selection, bread, ids.optionBreadBrioche);
    expect(selection.complementSelections[bread.id]).toEqual([]);
  });

  it("múltipla escolha respeita maxSelect", () => {
    let selection = toggleOption(emptySelection(), sauces, ids.optionSauceBbq);
    selection = toggleOption(selection, sauces, ids.optionSauceMayo);
    const blocked = toggleOption(selection, sauces, ids.optionSauceMustard);
    expect(blocked).toBe(selection);
    expect(groupStatus(sauces, selection).atMax).toBe(true);
    const removed = toggleOption(selection, sauces, ids.optionSauceBbq);
    expect(removed.complementSelections[sauces.id]).toEqual([ids.optionSauceMayo]);
  });
});

describe("CTA que diz o que falta (G2/I5)", () => {
  it("aponta o primeiro grupo obrigatório pendente", () => {
    const cta = selectionCta(burger, emptySelection());
    expect(cta).toEqual({
      groupId: ids.groupSteak,
      kind: "pending",
      label: "Escolha Ponto da carne",
    });
    expect(firstPendingGroup(burger, emptySelection())?.id).toBe(ids.groupSteak);
  });

  it("soma item, opção com preço, Adicional e quantidade no rótulo", () => {
    let selection = toggleOption(emptySelection(), steak, ids.optionSteakRare);
    selection = toggleOption(selection, bread, ids.optionBreadBrioche);
    selection = toggleAdditional(selection, ids.additionalBacon);
    selection = setQuantity(selection, 2);
    const cta = selectionCta(burger, selection);
    // (2500 + 250 + 300) × 2
    expect(cta).toEqual({ kind: "ready", label: "Adicionar · R$ 61,00", totalCents: 6100 });
    expect(selectionCta(burger, selection, "Salvar").label).toBe("Salvar · R$ 61,00");
  });

  it("item sem grupos fica pronto na hora; indisponível não tem CTA", () => {
    expect(selectionCta(soda, emptySelection())).toMatchObject({ kind: "ready", totalCents: 600 });
    expect(selectionCta(unavailableItem, emptySelection()).kind).toBe("unavailable");
  });

  it("Adicional indisponível bloqueia com pedido de revisão", () => {
    let selection = toggleOption(emptySelection(), steak, ids.optionSteakRare);
    selection = toggleAdditional(selection, ids.additionalEggOff);
    expect(selectionCta(burger, selection)).toMatchObject({
      kind: "pending",
      label: "Revise as escolhas",
    });
  });
});

describe("quantidade e linha", () => {
  it("limita a quantidade entre 1 e 99", () => {
    expect(setQuantity(emptySelection(), 0).quantity).toBe(1);
    expect(setQuantity(emptySelection(), 150).quantity).toBe(99);
    expect(setQuantity(emptySelection(), 2.5).quantity).toBe(1);
  });

  it("vai e volta da linha do carrinho sem grupos vazios (K2 Editar)", () => {
    let selection = toggleOption(emptySelection(), steak, ids.optionSteakRare);
    selection = toggleOption(selection, bread, ids.optionBreadBrioche);
    selection = toggleOption(selection, bread, ids.optionBreadBrioche);
    const line = toCartLine(burger.id, selection);
    expect(Object.keys(line.complementSelections)).toEqual([ids.groupSteak]);
    expect(selectionFromLine(line)).toEqual({
      additionalIds: [],
      complementSelections: { [ids.groupSteak]: [ids.optionSteakRare] },
      quantity: 1,
    });
  });
});
