import { describe, expect, it } from "vitest";

import { ownerPlanBanner, type OwnerPlanView, tierForOrders, tierLabel } from "./plan";

const TIERS = [
  { minOrders: 0, maxOrders: 150, priceCents: 8499 },
  { minOrders: 151, maxOrders: 250, priceCents: 16999 },
  { minOrders: 251, maxOrders: null, priceCents: 25499 },
];

const monthly = (orderCount: number): OwnerPlanView => ({
  month: "2026-11",
  orderCount,
  plan: { cycle: "monthly", validFrom: "2026-11-01T03:00:00.000Z", validTo: null },
  tier: tierForOrders(TIERS, orderCount),
});

describe("banner do Plano do Dono (decisão 72)", () => {
  it("mensal: barra enche com os Pedidos dentro da faixa, com faixa e valor", () => {
    expect(ownerPlanBanner(monthly(128))).toEqual({
      cycleLabel: "Plano mensal",
      progressLabel: "128 de 150 Pedidos",
      percent: 85,
      tierLabel: "Faixa até 150 Pedidos",
      priceLabel: "R$\u00a084,99/mês",
    });
    expect(ownerPlanBanner(monthly(200))).toMatchObject({
      progressLabel: "200 de 250 Pedidos",
      percent: 80,
      tierLabel: "Faixa de 151 a 250 Pedidos",
    });
  });

  it("faixa sem teto e anual: contagem sem barra", () => {
    expect(ownerPlanBanner(monthly(312))).toMatchObject({
      progressLabel: "312 Pedidos este mês",
      percent: null,
      tierLabel: "Faixa acima de 250 Pedidos",
      priceLabel: "R$\u00a0254,99/mês",
    });
    expect(
      ownerPlanBanner({
        month: "2026-11",
        orderCount: 1,
        plan: { cycle: "annual", validFrom: "2026-01-01T03:00:00.000Z", validTo: null },
        tier: { minOrders: 0, maxOrders: null, priceCents: 101988 },
      }),
    ).toEqual({
      cycleLabel: "Plano anual",
      progressLabel: "1 Pedido este mês",
      percent: null,
      tierLabel: "Pedidos ilimitados",
      priceLabel: "R$\u00a01.019,88/ano",
    });
  });

  it("sem Plano ativo não há banner; sem tabela de faixas, só a contagem", () => {
    expect(ownerPlanBanner({ month: "2026-11", orderCount: 0, plan: null, tier: null })).toBeNull();
    expect(ownerPlanBanner({ ...monthly(3), tier: null })).toMatchObject({
      progressLabel: "3 Pedidos este mês",
      tierLabel: null,
      priceLabel: null,
    });
  });

  it("faixa da contagem e rótulos", () => {
    expect(tierForOrders(TIERS, 151)?.priceCents).toBe(16999);
    expect(tierForOrders([], 10)).toBeNull();
    expect(tierLabel({ minOrders: 0, maxOrders: null, priceCents: 1 }, "annual")).toBe(
      "Pedidos ilimitados",
    );
  });
});
