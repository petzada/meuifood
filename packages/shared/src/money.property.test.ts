// Propriedades do dinheiro (decisão 67: fast-check em dinheiro). Complementa os exemplos de
// money.test.ts: ida e volta reais ↔ centavos, soma e multiplicação inteiras, percentual
// com arredondamento meio-para-cima e limites do teto do domínio.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_CENTS,
  centsToReaisInput,
  formatBRL,
  isCents,
  multiplyCents,
  percentOfCents,
  reaisToCents,
  sumCents,
} from "./money.js";

const cents = fc.integer({ min: 0, max: MAX_CENTS });
const smallCents = fc.integer({ min: 0, max: 10_000_000 });
/** Percentual com até duas casas, como as faixas e taxas (ex.: 3,49%). */
const percent = fc.integer({ min: 0, max: 10_000 }).map((bp) => bp / 100);

describe("money: propriedades", () => {
  it("reais → centavos desfaz centsToReaisInput em todo o domínio", () => {
    fc.assert(
      fc.property(cents, (value) => {
        expect(reaisToCents(centsToReaisInput(value))).toBe(value);
      }),
    );
  });

  it("formatBRL volta ao mesmo valor pelo parser do Painel (milhar e vírgula)", () => {
    fc.assert(
      fc.property(cents, (value) => {
        const text = formatBRL(value);
        expect(text).toMatch(/^R\$\u00a0\d{1,3}(\.\d{3})*,\d{2}$/u);
        expect(reaisToCents(text.replace("\u00a0", " "))).toBe(value);
      }),
    );
  });

  it("uma casa decimal vale dezenas de centavos, com ponto ou vírgula", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999_999 }),
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom(".", ","),
        (whole, tenth, separator) => {
          expect(reaisToCents(`${whole}${separator}${tenth}`)).toBe(whole * 100 + tenth * 10);
        },
      ),
    );
  });

  it("nada acima do teto ou com três casas vira centavos", () => {
    fc.assert(
      fc.property(fc.integer({ min: MAX_CENTS + 1, max: 999_999_999 }), (value) => {
        expect(reaisToCents(centsToReaisInput(value))).toBeNull();
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 100, max: 999 }), (w, f) => {
        expect(reaisToCents(`${w},${f}`)).toBeNull();
      }),
    );
  });

  it("sumCents é a soma inteira e não depende da ordem", () => {
    fc.assert(
      fc.property(fc.array(smallCents, { maxLength: 60 }), (values) => {
        const total = sumCents(values);
        expect(total).toBe(values.reduce((acc, value) => acc + value, 0));
        expect(sumCents([...values].reverse())).toBe(total);
        expect(isCents(total)).toBe(true);
      }),
    );
  });

  it("multiplyCents é soma repetida e distribui sobre a soma", () => {
    fc.assert(
      fc.property(smallCents, smallCents, fc.integer({ min: 0, max: 99 }), (a, b, quantity) => {
        expect(multiplyCents(a, quantity)).toBe(
          sumCents(Array.from({ length: quantity }, () => a)),
        );
        expect(multiplyCents(a + b, quantity)).toBe(
          multiplyCents(a, quantity) + multiplyCents(b, quantity),
        );
      }),
    );
  });

  it("multiplyCents recusa quantidade negativa ou fracionária", () => {
    fc.assert(
      fc.property(
        smallCents,
        fc.oneof(
          fc.integer({ min: -1000, max: -1 }),
          fc.double({ min: 0.01, max: 98.99, noInteger: true }),
        ),
        (unit, quantity) => {
          expect(() => multiplyCents(unit, quantity)).toThrow(RangeError);
        },
      ),
    );
  });

  it("percentOfCents arredonda meio-para-cima e fica a meio centavo do exato", () => {
    fc.assert(
      fc.property(cents, percent, (value, p) => {
        const result = percentOfCents(value, p);
        const exactTimes2 = (value * Math.round(p * 100) * 2) / 10_000;
        expect(Number.isSafeInteger(result)).toBe(true);
        // |2·resultado − 2·exato| ≤ 1, e no empate (x,5) sobe.
        expect(Math.abs(result * 2 - exactTimes2)).toBeLessThanOrEqual(1);
        if (Math.abs(result * 2 - exactTimes2) === 1)
          expect(result * 2).toBeGreaterThan(exactTimes2);
      }),
    );
  });

  it("percentOfCents: 0% é zero, 100% é o valor e cresce com valor e percentual", () => {
    fc.assert(
      fc.property(cents, cents, percent, percent, (a, b, p, q) => {
        expect(percentOfCents(a, 0)).toBe(0);
        expect(percentOfCents(a, 100)).toBe(a);
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(percentOfCents(low, p)).toBeLessThanOrEqual(percentOfCents(high, p));
        const [pl, ph] = p <= q ? [p, q] : [q, p];
        expect(percentOfCents(a, pl)).toBeLessThanOrEqual(percentOfCents(a, ph));
      }),
    );
  });

  it("desconto e restante somam o valor original a menos de 1 centavo", () => {
    fc.assert(
      fc.property(cents, percent, (value, p) => {
        const discount = percentOfCents(value, p);
        const rest = percentOfCents(value, 100 - p);
        expect(Math.abs(discount + rest - value)).toBeLessThanOrEqual(1);
      }),
    );
  });
});
