import { PLAN_TIERS_SEED } from "@foode/shared/ops";
import { describe, expect, it } from "vitest";

import {
  ANNUAL_DISCOUNT_PERCENT,
  ANNUAL_INSTALLMENT_CENTS,
  ANNUAL_INSTALLMENT_TOTAL_CENTS,
  ANNUAL_PRICE_CENTS,
  estimateSavings,
  formatBRL,
  priceInstallmentCents,
  tierLabel,
} from "./pricing";

describe("preços da landing (decisões 61 e 71)", () => {
  it("lê as faixas e o anual de @foode/shared", () => {
    expect(ANNUAL_PRICE_CENTS).toBe(PLAN_TIERS_SEED.annualPriceCents);
    expect(formatBRL(ANNUAL_PRICE_CENTS)).toBe("R$ 1.019,88");
  });

  it("calcula a parcela do Anual pela Tabela Price (6× a 2,99% a.m.) = R$ 188,20", () => {
    expect(ANNUAL_INSTALLMENT_CENTS).toBe(18820);
    expect(formatBRL(ANNUAL_INSTALLMENT_CENTS)).toBe("R$ 188,20");
    expect(ANNUAL_INSTALLMENT_TOTAL_CENTS).toBe(112920);
  });

  it("priceInstallmentCents: juros zero divide igual e recusa entrada inválida", () => {
    expect(priceInstallmentCents(120000, 0, 6)).toBe(20000);
    expect(() => priceInstallmentCents(-1, 0.01, 6)).toThrow(RangeError);
    expect(() => priceInstallmentCents(100, 0.01, 0)).toThrow(RangeError);
  });

  it("desconto real do Anual contra a faixa sem teto, arredondado para baixo", () => {
    // 1 − 1.019,88 / (254,99 × 12) = 66,67% → 66
    expect(ANNUAL_DISCOUNT_PERCENT).toBe(66);
  });

  it("rotula as faixas na linguagem do lojista", () => {
    expect(PLAN_TIERS_SEED.monthlyTiers.map(tierLabel)).toEqual([
      "Até 150 pedidos",
      "151 a 250 pedidos",
      "Acima de 250 pedidos",
    ]);
  });

  it("estimateSavings usa a faixa dos pedidos informados", () => {
    const result = estimateSavings({
      ordersPerMonth: 200,
      averageTicketCents: 6000,
      commissionPercent: 23,
    });
    expect(result.tier.priceCents).toBe(16999);
    expect(result.commissionCents).toBe(276000);
    expect(result.savingsCents).toBe(276000 - 16999);
    expect(result.yearlySavingsCents).toBe(result.savingsCents * 12);
  });

  it("estimateSavings tolera volume pequeno (economia negativa) e limita a comissão a 100%", () => {
    const small = estimateSavings({
      ordersPerMonth: 5,
      averageTicketCents: 3000,
      commissionPercent: 10,
    });
    expect(small.savingsCents).toBeLessThan(0);
    const capped = estimateSavings({
      ordersPerMonth: 10,
      averageTicketCents: 1000,
      commissionPercent: 250,
    });
    expect(capped.commissionCents).toBe(10000);
  });
});
