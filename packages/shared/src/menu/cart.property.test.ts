// Propriedades do carrinho (decisão 67: fast-check em dinheiro). Gera itens com grupos de
// Complemento (mínimo/máximo, opções pagas) e Adicionais, escolhe linhas válidas e confere
// que o subtotal é exatamente preço + opções + Adicionais, vezes a quantidade, em inteiros.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { sumCents } from "../money.js";
import {
  MAX_LINE_QUANTITY,
  addCartLine,
  cartSubtotalCents,
  createEmptyCart,
  lineSubtotalCents,
  lineUnitCents,
  setCartLineQuantity,
  validateCartLine,
  type CartLine,
} from "./cart.js";
import type { MenuItem } from "./schema.js";

let seq = 0;
const freshId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const price = fc.integer({ min: 0, max: 50_000 });

const groupArb = fc
  .array(price, { minLength: 1, maxLength: 6 })
  .chain((prices) =>
    fc
      .integer({ min: 1, max: prices.length })
      .chain((maxSelect) =>
        fc
          .integer({ min: 0, max: maxSelect })
          .map((minSelect) => ({ maxSelect, minSelect, prices })),
      ),
  );

const itemArb: fc.Arbitrary<MenuItem> = fc
  .record({
    additionals: fc.array(fc.record({ available: fc.boolean(), priceCents: price }), {
      maxLength: 4,
    }),
    groups: fc.array(groupArb, { maxLength: 4 }),
    priceCents: price,
  })
  .map(({ additionals, groups, priceCents }) => ({
    additionals: additionals.map((additional, i) => ({
      ...additional,
      id: freshId(),
      name: `Adicional ${i}`,
    })),
    available: true,
    complementGroups: groups.map((group, g) => ({
      id: freshId(),
      maxSelect: group.maxSelect,
      minSelect: group.minSelect,
      name: `Grupo ${g}`,
      options: group.prices.map((optionPrice, o) => ({
        id: freshId(),
        name: `Opção ${o}`,
        priceCents: optionPrice,
      })),
    })),
    description: "",
    featured: false,
    id: freshId(),
    imageUrl: null,
    name: "Item",
    priceCents,
  }));

/** Linha válida para o item: quantidade de opções entre mín e máx, Adicionais disponíveis. */
function validLineArb(item: MenuItem): fc.Arbitrary<CartLine> {
  const groupChoices = item.complementGroups.map((group) =>
    fc
      .integer({ min: group.minSelect, max: group.maxSelect })
      .chain((count) => fc.shuffledSubarray(group.options, { minLength: count, maxLength: count })),
  );
  const available = item.additionals.filter((additional) => additional.available);
  return fc
    .record({
      additionals: fc.subarray(available),
      groups: fc.tuple(...groupChoices),
      quantity: fc.integer({ min: 1, max: MAX_LINE_QUANTITY }),
    })
    .map(({ additionals, groups, quantity }) => ({
      additionalIds: additionals.map((additional) => additional.id),
      complementSelections: Object.fromEntries(
        item.complementGroups.map((group, i) => [
          group.id,
          (groups[i] ?? []).map((option) => option.id),
        ]),
      ),
      itemId: item.id,
      quantity,
    }));
}

const itemWithLine = itemArb.chain((item) => validLineArb(item).map((line) => ({ item, line })));

function expectedUnit(item: MenuItem, line: CartLine): number {
  const options = item.complementGroups.flatMap((group) =>
    group.options.filter((option) =>
      (line.complementSelections[group.id] ?? []).includes(option.id),
    ),
  );
  const additionals = item.additionals.filter((additional) =>
    line.additionalIds.includes(additional.id),
  );
  return (
    item.priceCents +
    options.reduce((acc, option) => acc + option.priceCents, 0) +
    additionals.reduce((acc, additional) => acc + additional.priceCents, 0)
  );
}

describe("carrinho: propriedades", () => {
  it("toda linha gerada dentro de mín/máx é válida e o subtotal é unitário × quantidade", () => {
    fc.assert(
      fc.property(itemWithLine, ({ item, line }) => {
        expect(validateCartLine(item, line)).toEqual({ ok: true });
        const unit = lineUnitCents(item, line);
        expect(unit).toBe(expectedUnit(item, line));
        expect(lineSubtotalCents(item, line)).toBe(unit * line.quantity);
      }),
    );
  });

  it("opção a menos que o mínimo ou a mais que o máximo invalida a linha", () => {
    fc.assert(
      fc.property(itemWithLine, ({ item, line }) => {
        for (const group of item.complementGroups) {
          const chosen = line.complementSelections[group.id] ?? [];
          if (group.minSelect > 0) {
            const fewer = {
              ...line,
              complementSelections: {
                ...line.complementSelections,
                [group.id]: chosen.slice(0, group.minSelect - 1),
              },
            };
            expect(lineSubtotalCents(item, fewer)).toBeNull();
          }
          if (group.options.length > group.maxSelect) {
            const extra = group.options.slice(0, group.maxSelect + 1).map((option) => option.id);
            const more = {
              ...line,
              complementSelections: { ...line.complementSelections, [group.id]: extra },
            };
            expect(lineSubtotalCents(item, more)).toBeNull();
          }
        }
      }),
    );
  });

  it("subtotal do carrinho é a soma das linhas e não depende da ordem", () => {
    fc.assert(
      fc.property(fc.array(itemWithLine, { minLength: 1, maxLength: 8 }), (pairs) => {
        const itemsById = new Map(pairs.map(({ item }) => [item.id, item]));
        const lines = pairs.map(({ line }) => line);
        const result = cartSubtotalCents(itemsById, { lines });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.subtotalCents).toBe(
          sumCents(pairs.map(({ item, line }) => expectedUnit(item, line) * line.quantity)),
        );
        const reversed = cartSubtotalCents(itemsById, { lines: [...lines].reverse() });
        expect(reversed.ok && reversed.subtotalCents).toBe(result.subtotalCents);
      }),
    );
  });

  it("adicionar a mesma escolha soma a quantidade até o teto, sem nova linha", () => {
    fc.assert(
      fc.property(
        itemWithLine,
        fc.integer({ min: 1, max: MAX_LINE_QUANTITY }),
        ({ line }, again) => {
          const once = addCartLine(createEmptyCart("loja-teste"), line);
          const twice = addCartLine(once, {
            ...line,
            additionalIds: [...line.additionalIds].reverse(),
            quantity: again,
          });
          expect(twice.lines).toHaveLength(1);
          expect(twice.lines[0]?.quantity).toBe(Math.min(MAX_LINE_QUANTITY, line.quantity + again));
        },
      ),
    );
  });

  it("quantidade 0 remove a linha; fora de 0..99 não muda nada", () => {
    fc.assert(
      fc.property(itemWithLine, fc.integer({ min: -50, max: 200 }), ({ line }, quantity) => {
        const cart = addCartLine(createEmptyCart("loja-teste"), line);
        const next = setCartLineQuantity(cart, 0, quantity);
        if (quantity === 0) expect(next.lines).toHaveLength(0);
        else if (quantity < 0 || quantity > MAX_LINE_QUANTITY) expect(next).toBe(cart);
        else expect(next.lines[0]?.quantity).toBe(quantity);
      }),
    );
  });
});
