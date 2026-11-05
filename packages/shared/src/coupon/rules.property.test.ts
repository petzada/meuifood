// Propriedades do desconto do Cupom (decisão 67: fast-check em dinheiro): nunca negativo, nunca
// maior que o subtotal dos itens (a taxa de Delivery fica fora), respeita o teto do % e o valor fixo.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_CENTS, percentOfCents } from "../money.js";
import {
  type CouponDiscountRule,
  couponDiscountCents,
  maskToWeekdays,
  weekdaysToMask,
} from "./rules.js";

const subtotal = fc.integer({ min: 0, max: MAX_CENTS });
const rule: fc.Arbitrary<CouponDiscountRule> = fc.oneof(
  fc.record({
    kind: fc.constant("percent" as const),
    percent: fc.integer({ min: 1, max: 100 }),
    maxDiscountCents: fc.option(fc.integer({ min: 1, max: MAX_CENTS }), { nil: null }),
  }),
  fc.record({
    kind: fc.constant("fixed" as const),
    amountCents: fc.integer({ min: 1, max: MAX_CENTS }),
  }),
);

describe("couponDiscountCents (propriedades)", () => {
  it("fica entre 0 e o subtotal dos itens, em centavos inteiros", () => {
    fc.assert(
      fc.property(rule, subtotal, (r, s) => {
        const discount = couponDiscountCents(r, s);
        expect(Number.isSafeInteger(discount)).toBe(true);
        expect(discount).toBeGreaterThanOrEqual(0);
        expect(discount).toBeLessThanOrEqual(s);
      }),
    );
  });

  it("taxa de Delivery não entra: total com Cupom nunca fica abaixo da taxa", () => {
    fc.assert(
      fc.property(rule, subtotal, fc.integer({ min: 0, max: 100_000 }), (r, s, fee) => {
        const total = s + fee - couponDiscountCents(r, s);
        expect(total).toBeGreaterThanOrEqual(fee);
      }),
    );
  });

  it("% respeita o teto e é o % arredondado quando o teto não corta", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.option(fc.integer({ min: 1, max: MAX_CENTS }), { nil: null }),
        subtotal,
        (percent, cap, s) => {
          const discount = couponDiscountCents(
            { kind: "percent", percent, maxDiscountCents: cap },
            s,
          );
          if (cap !== null) expect(discount).toBeLessThanOrEqual(cap);
          expect(discount).toBe(Math.min(percentOfCents(s, percent), cap ?? MAX_CENTS));
        },
      ),
    );
  });

  it("valor fixo = min(valor, subtotal)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CENTS }), subtotal, (amount, s) => {
        expect(couponDiscountCents({ kind: "fixed", amountCents: amount }, s)).toBe(
          Math.min(amount, s),
        );
      }),
    );
  });

  it("é monotônico no subtotal (mais itens nunca dá menos desconto)", () => {
    fc.assert(
      fc.property(rule, subtotal, subtotal, (r, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(couponDiscountCents(r, low)).toBeLessThanOrEqual(couponDiscountCents(r, high));
      }),
    );
  });

  it("máscara de dias ida e volta", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 7 })), (days) => {
        expect(maskToWeekdays(weekdaysToMask(days))).toEqual([...days].sort((x, y) => x - y));
      }),
    );
  });
});
