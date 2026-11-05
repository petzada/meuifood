import { describe, expect, it } from "vitest";

import { formatBRL } from "../money.js";
import { checkoutErrorMessagePt, checkoutQuoteRequestSchema } from "../order/checkout.js";
import {
  COUPON_TEMPLATES,
  couponCreateInputSchema,
  couponUpdateInputSchema,
  welcomeCouponInputSchema,
} from "./admin.js";
import {
  couponCodeSchema,
  couponDiscountLabelPt,
  couponRejectionMessagePt,
  couponStatus,
  type CouponUsageRule,
  evaluateCoupon,
  maskIncludes,
  saoPauloDay,
  WEEKDAY_PICKER_ORDER,
  WEEKDAY_SHORT_PT,
  weekdaysToMask,
  welcomeEligible,
} from "./rules.js";

// 2026-11-05 é quinta-feira. 02:30 UTC = quarta 23:30 em São Paulo (UTC−3).
const THU_NOON = Date.parse("2026-11-05T15:00:00.000Z");
const WED_LATE = Date.parse("2026-11-05T02:30:00.000Z");

function rule(overrides: Partial<CouponUsageRule> = {}): CouponUsageRule {
  return {
    kind: "percent",
    percent: 10,
    maxDiscountCents: null,
    active: true,
    minOrderCents: null,
    startsOn: null,
    endsOn: null,
    weekdaysMask: 0,
    usageLimit: null,
    usedCount: 0,
    ...overrides,
  } as CouponUsageRule;
}

describe("código do Cupom", () => {
  it("apara e põe em maiúsculas; recusa curto, longo e caractere estranho", () => {
    expect(couponCodeSchema.parse("  bemvindo10 ")).toBe("BEMVINDO10");
    expect(couponCodeSchema.safeParse("ab").success).toBe(false);
    expect(couponCodeSchema.safeParse("A".repeat(21)).success).toBe(false);
    expect(couponCodeSchema.safeParse("10% OFF").success).toBe(false);
    expect(couponCodeSchema.parse("semana_15-x")).toBe("SEMANA_15-X");
  });
});

describe("data e dia da semana em São Paulo", () => {
  it("usa o dia civil de São Paulo, não o de UTC", () => {
    expect(saoPauloDay(WED_LATE)).toEqual({ date: "2026-11-04", weekday: 3 });
    expect(saoPauloDay(THU_NOON)).toEqual({ date: "2026-11-05", weekday: 4 });
  });

  it("máscara vazia = todos os dias; dias marcados só eles", () => {
    expect(maskIncludes(0, 7)).toBe(true);
    const thuOnly = weekdaysToMask([4]);
    expect(maskIncludes(thuOnly, 4)).toBe(true);
    expect(maskIncludes(thuOnly, 3)).toBe(false);
    expect(() => weekdaysToMask([8])).toThrow(RangeError);
    expect(WEEKDAY_PICKER_ORDER.map((day) => WEEKDAY_SHORT_PT[day]).join("")).toBe("DSTQQSS");
  });
});

describe("evaluateCoupon", () => {
  it("aplica % sobre o subtotal dos itens", () => {
    expect(evaluateCoupon(rule(), { nowMs: THU_NOON, itemsSubtotalCents: 5180 })).toEqual({
      ok: true,
      discountCents: 518,
    });
  });

  it("validade por data inclusiva no fuso de São Paulo", () => {
    const thuOnly = rule({ startsOn: "2026-11-05", endsOn: "2026-11-05" });
    expect(evaluateCoupon(thuOnly, { nowMs: THU_NOON, itemsSubtotalCents: 1000 }).ok).toBe(true);
    // Quarta 23:30 em SP ainda é antes do início (em UTC já seria quinta).
    expect(evaluateCoupon(thuOnly, { nowMs: WED_LATE, itemsSubtotalCents: 1000 })).toEqual({
      ok: false,
      reason: "not_started",
    });
    const endedWed = rule({ endsOn: "2026-11-04" });
    expect(evaluateCoupon(endedWed, { nowMs: WED_LATE, itemsSubtotalCents: 1000 }).ok).toBe(true);
    expect(evaluateCoupon(endedWed, { nowMs: THU_NOON, itemsSubtotalCents: 1000 })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("dia da semana, inativo, esgotado, mínimo e sem desconto", () => {
    const sat = rule({ weekdaysMask: weekdaysToMask([6]) });
    expect(evaluateCoupon(sat, { nowMs: THU_NOON, itemsSubtotalCents: 1000 })).toEqual({
      ok: false,
      reason: "not_today",
    });
    expect(
      evaluateCoupon(rule({ active: false }), { nowMs: THU_NOON, itemsSubtotalCents: 1 }),
    ).toEqual({ ok: false, reason: "inactive" });
    expect(
      evaluateCoupon(rule({ usageLimit: 3, usedCount: 3 }), {
        nowMs: THU_NOON,
        itemsSubtotalCents: 1000,
      }),
    ).toEqual({ ok: false, reason: "exhausted" });
    expect(
      evaluateCoupon(rule({ minOrderCents: 4000 }), { nowMs: THU_NOON, itemsSubtotalCents: 3999 }),
    ).toEqual({ ok: false, reason: "below_minimum", minimumCents: 4000 });
    expect(
      evaluateCoupon(rule({ percent: 1 }), { nowMs: THU_NOON, itemsSubtotalCents: 10 }),
    ).toEqual({ ok: false, reason: "no_discount" });
  });

  it("teto do % e valor fixo limitado ao subtotal", () => {
    expect(
      evaluateCoupon(rule({ percent: 50, maxDiscountCents: 1500 }), {
        nowMs: THU_NOON,
        itemsSubtotalCents: 10_000,
      }),
    ).toEqual({ ok: true, discountCents: 1500 });
    expect(
      evaluateCoupon({ ...rule(), kind: "fixed", amountCents: 3000 } as CouponUsageRule, {
        nowMs: THU_NOON,
        itemsSubtotalCents: 2000,
      }),
    ).toEqual({ ok: true, discountCents: 2000 });
  });
});

describe("status, rótulos e mensagens", () => {
  it("Expirado e Esgotado vencem Inativo; Agendado antes do início", () => {
    const base = { active: true, startsOn: null, endsOn: null, usageLimit: null, usedCount: 0 };
    expect(couponStatus(base, THU_NOON)).toBe("active");
    expect(couponStatus({ ...base, active: false }, THU_NOON)).toBe("inactive");
    expect(couponStatus({ ...base, active: false, endsOn: "2026-11-01" }, THU_NOON)).toBe(
      "expired",
    );
    expect(couponStatus({ ...base, usageLimit: 1, usedCount: 1 }, THU_NOON)).toBe("exhausted");
    expect(couponStatus({ ...base, startsOn: "2026-12-01" }, THU_NOON)).toBe("scheduled");
  });

  it("mensagem específica por motivo; inativo = não encontrado", () => {
    expect(couponRejectionMessagePt({ reason: "inactive" })).toBe("Cupom não encontrado.");
    expect(couponRejectionMessagePt({ reason: "not_found" })).toBe("Cupom não encontrado.");
    expect(couponRejectionMessagePt({ reason: "expired" })).toBe("Este cupom expirou.");
    expect(couponRejectionMessagePt({ reason: "not_today" })).toBe("Este cupom não vale hoje.");
    expect(couponRejectionMessagePt({ reason: "below_minimum", minimumCents: 4000 })).toContain(
      formatBRL(4000),
    );
    for (const reason of ["not_started", "exhausted", "no_discount", "below_minimum"] as const) {
      expect(couponRejectionMessagePt({ reason }).length).toBeGreaterThan(5);
    }
    expect(checkoutErrorMessagePt({ code: "coupon_invalid", reason: "exhausted" })).toBe(
      "Este cupom esgotou.",
    );
    expect(couponDiscountLabelPt({ kind: "percent", percent: 10, maxDiscountCents: 1500 })).toBe(
      `10% (até ${formatBRL(1500)})`,
    );
    expect(couponDiscountLabelPt({ kind: "percent", percent: 10, maxDiscountCents: null })).toBe(
      "10%",
    );
    expect(couponDiscountLabelPt({ kind: "fixed", amountCents: 500 })).toBe(formatBRL(500));
  });
});

describe("boas-vindas de primeira compra (decisão 66)", () => {
  const eligible = {
    programActive: true,
    hasAccount: true,
    hasOrderInStore: false,
    alreadyRedeemedInStore: false,
  };
  it("só com programa ativo, conta e nenhum Pedido nem uso na Loja", () => {
    expect(welcomeEligible(eligible)).toBe(true);
    expect(welcomeEligible({ ...eligible, programActive: false })).toBe(false);
    expect(welcomeEligible({ ...eligible, hasAccount: false })).toBe(false);
    expect(welcomeEligible({ ...eligible, hasOrderInStore: true })).toBe(false);
    expect(welcomeEligible({ ...eligible, alreadyRedeemedInStore: true })).toBe(false);
  });
});

describe("contrato do Painel", () => {
  it("cria % com teto e dias; R$ sem teto; período invertido recusado", () => {
    const parsed = couponCreateInputSchema.parse({
      code: "semana15",
      kind: "percent",
      percent: 15,
      maxDiscountCents: 2000,
      weekdays: [1, 2],
      usageLimit: 100,
    });
    expect(parsed).toMatchObject({
      code: "SEMANA15",
      kind: "percent",
      maxDiscountCents: 2000,
      minOrderCents: null,
      startsOn: null,
      active: true,
    });
    expect(
      couponCreateInputSchema.parse({ code: "GANHE5", kind: "fixed", amountCents: 500 }),
    ).toMatchObject({ kind: "fixed", amountCents: 500, weekdays: [] });
    expect(
      couponCreateInputSchema.safeParse({
        code: "X10",
        kind: "percent",
        percent: 10,
        startsOn: "2026-12-10",
        endsOn: "2026-12-01",
      }).success,
    ).toBe(false);
    expect(
      couponCreateInputSchema.safeParse({ code: "X10", kind: "percent", percent: 101 }).success,
    ).toBe(false);
    expect(
      couponCreateInputSchema.safeParse({
        code: "X10",
        kind: "percent",
        percent: 10,
        weekdays: [1, 1],
      }).success,
    ).toBe(false);
    expect(
      couponCreateInputSchema.safeParse({
        code: "X10",
        kind: "fixed",
        amountCents: 500,
        startsOn: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      couponUpdateInputSchema.safeParse({
        couponId: "nao-uuid",
        code: "X10",
        kind: "fixed",
        amountCents: 1,
      }).success,
    ).toBe(false);
    expect(
      welcomeCouponInputSchema.parse({ active: true, kind: "fixed", amountCents: 1000 }),
    ).toMatchObject({ active: true, minOrderCents: null });
  });

  it("modelos só preenchem o formulário e passam na validação", () => {
    for (const template of COUPON_TEMPLATES) {
      const { fill } = template;
      const input =
        fill.kind === "percent"
          ? {
              code: fill.suggestedCode,
              kind: "percent" as const,
              percent: fill.percent!,
              maxDiscountCents: fill.maxDiscountCents,
            }
          : { code: fill.suggestedCode, kind: "fixed" as const, amountCents: fill.amountCents! };
      expect(
        couponCreateInputSchema.safeParse({
          ...input,
          minOrderCents: fill.minOrderCents,
          weekdays: fill.weekdays,
          usageLimit: fill.usageLimit,
        }).success,
      ).toBe(true);
    }
    expect(COUPON_TEMPLATES.length).toBeGreaterThanOrEqual(2);
  });

  it("checkout aceita couponCode opcional (normalizado) e o omite como null", () => {
    const base = {
      lines: [
        {
          itemId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          complementSelections: {},
          additionalIds: [],
        },
      ],
      fulfillment: "pickup" as const,
    };
    expect(checkoutQuoteRequestSchema.parse(base).couponCode ?? null).toBeNull();
    expect(checkoutQuoteRequestSchema.parse({ ...base, couponCode: " ganhe5 " }).couponCode).toBe(
      "GANHE5",
    );
  });
});
