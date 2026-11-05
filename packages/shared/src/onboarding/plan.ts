// Plano do Dono no Painel (decisão 72: banner na sidebar + `/plano` só leitura). A api monta o
// `OwnerPlanView` (Plano vigente, faixa do mês e contagem de Pedidos não cancelados do mês civil
// de São Paulo); o admin só formata com `ownerPlanBanner`. Cobrança fora do app (decisão 61).
import { formatBRL } from "../money.js";
import type { BillingCycle, PlanTier } from "../ops/plans.js";

export type OwnerPlanView = {
  /** Mês civil `YYYY-MM` (America/Sao_Paulo) da contagem. */
  month: string;
  /** Pedidos não cancelados do mês. */
  orderCount: number;
  /** Plano vigente agora; null = Loja sem Plano ativo. */
  plan: { cycle: BillingCycle; validFrom: string; validTo: string | null } | null;
  /** Faixa em que a contagem cai (mensal) ou a faixa única ilimitada (anual); null sem Plano/tabela. */
  tier: PlanTier | null;
};

/** Faixa da contagem: a que contém `orders` (tabela contígua do Ops). */
export function tierForOrders(tiers: readonly PlanTier[], orders: number): PlanTier | null {
  return (
    tiers.find(
      (tier) => orders >= tier.minOrders && (tier.maxOrders === null || orders <= tier.maxOrders),
    ) ?? null
  );
}

export type OwnerPlanBanner = {
  cycleLabel: string;
  /** "128 de 150 Pedidos" / "312 Pedidos este mês" / "Pedidos ilimitados". */
  progressLabel: string;
  /** 0–100; null = sem barra (anual ou faixa sem teto). */
  percent: number | null;
  /** "Faixa até 150 Pedidos", "Faixa de 151 a 250 Pedidos", "Faixa acima de 250 Pedidos". */
  tierLabel: string | null;
  /** "R$ 84,99/mês" ou "R$ 1.019,88/ano". */
  priceLabel: string | null;
};

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Plano mensal",
  annual: "Plano anual",
};

function pedidos(count: number): string {
  return `${count} ${count === 1 ? "Pedido" : "Pedidos"}`;
}

export function tierLabel(tier: PlanTier, cycle: BillingCycle): string {
  if (cycle === "annual") return "Pedidos ilimitados";
  if (tier.maxOrders === null) return `Faixa acima de ${Math.max(tier.minOrders - 1, 0)} Pedidos`;
  if (tier.minOrders <= 1) return `Faixa até ${tier.maxOrders} Pedidos`;
  return `Faixa de ${tier.minOrders} a ${tier.maxOrders} Pedidos`;
}

/** Texto e progresso do banner/página a partir da visão da api; null sem Plano ativo. */
export function ownerPlanBanner(view: OwnerPlanView): OwnerPlanBanner | null {
  if (!view.plan) return null;
  const { cycle } = view.plan;
  const tier = view.tier;
  const priceLabel = tier
    ? `${formatBRL(tier.priceCents)}/${cycle === "annual" ? "ano" : "mês"}`
    : null;
  if (cycle === "annual") {
    return {
      cycleLabel: CYCLE_LABEL.annual,
      progressLabel: `${pedidos(view.orderCount)} este mês`,
      percent: null,
      tierLabel: "Pedidos ilimitados",
      priceLabel,
    };
  }
  if (!tier || tier.maxOrders === null) {
    return {
      cycleLabel: CYCLE_LABEL.monthly,
      progressLabel: `${pedidos(view.orderCount)} este mês`,
      percent: null,
      tierLabel: tier ? tierLabel(tier, cycle) : null,
      priceLabel,
    };
  }
  return {
    cycleLabel: CYCLE_LABEL.monthly,
    progressLabel: `${view.orderCount} de ${tier.maxOrders} Pedidos`,
    percent: Math.min(100, Math.round((view.orderCount / tier.maxOrders) * 100)),
    tierLabel: tierLabel(tier, cycle),
    priceLabel,
  };
}
