// Preços da landing lidos de `@foode/shared` (decisão 61) e derivados calculados aqui
// (decisão 71): nunca um valor fixado à mão. A tarifa de serviço do Consumidor NÃO entra
// neste módulo nem em nenhuma seção pública: só nos termos.
import { formatBRL } from "@foode/shared/money";
import { PLAN_TIERS_SEED, tierForOrderCount, type PlanTier } from "@foode/shared/ops";

export const MONTHLY_TIERS: readonly PlanTier[] = PLAN_TIERS_SEED.monthlyTiers;
export const ANNUAL_PRICE_CENTS: number = PLAN_TIERS_SEED.annualPriceCents;

/** Parcelamento do Anual (decisão 71): até 6× a 2,99% a.m. pela Tabela Price. */
export const ANNUAL_INSTALLMENTS = 6;
export const ANNUAL_INSTALLMENT_RATE = 0.0299;

/**
 * Parcela da Tabela Price em centavos, arredondada ao centavo:
 * `parcela = PV × i / (1 − (1 + i)^−n)`.
 */
export function priceInstallmentCents(
  principalCents: number,
  monthlyRate: number,
  installments: number,
): number {
  if (!Number.isSafeInteger(principalCents) || principalCents < 0) {
    throw new RangeError("principalCents precisa ser inteiro não negativo");
  }
  if (!Number.isInteger(installments) || installments < 1) {
    throw new RangeError("installments precisa ser inteiro >= 1");
  }
  if (monthlyRate === 0) return Math.round(principalCents / installments);
  const factor = monthlyRate / (1 - (1 + monthlyRate) ** -installments);
  return Math.round(principalCents * factor);
}

export const ANNUAL_INSTALLMENT_CENTS = priceInstallmentCents(
  ANNUAL_PRICE_CENTS,
  ANNUAL_INSTALLMENT_RATE,
  ANNUAL_INSTALLMENTS,
);

/** Total pago no parcelamento (6 × parcela). Vai só nos termos; o card mostra o à vista. */
export const ANNUAL_INSTALLMENT_TOTAL_CENTS = ANNUAL_INSTALLMENT_CENTS * ANNUAL_INSTALLMENTS;

/** Faixa mais cara do Mensal (pedidos ilimitados é o que o Anual substitui). */
export const TOP_MONTHLY_TIER: PlanTier = MONTHLY_TIERS[MONTHLY_TIERS.length - 1]!;
export const FIRST_MONTHLY_TIER: PlanTier = MONTHLY_TIERS[0]!;

/**
 * Desconto real do Anual: compara o ano inteiro (12 mensalidades) da faixa sem teto — a única
 * que também não limita pedidos — com o preço do Anual. Arredondado para baixo (nunca promete
 * mais do que entrega).
 */
export const ANNUAL_DISCOUNT_PERCENT = Math.floor(
  (1 - ANNUAL_PRICE_CENTS / (TOP_MONTHLY_TIER.priceCents * 12)) * 100,
);

/** "Até 150 pedidos", "151 a 250 pedidos", "Acima de 250 pedidos". */
export function tierLabel(tier: PlanTier): string {
  if (tier.minOrders === 0 && tier.maxOrders !== null) return `Até ${tier.maxOrders} pedidos`;
  if (tier.maxOrders === null) return `Acima de ${tier.minOrders - 1} pedidos`;
  return `${tier.minOrders} a ${tier.maxOrders} pedidos`;
}

export type SavingsInput = {
  ordersPerMonth: number;
  averageTicketCents: number;
  /** Comissão que o lojista paga hoje, em % (ex.: 23 = 23%). */
  commissionPercent: number;
};

export type SavingsResult = {
  tier: PlanTier;
  /** Quanto a comissão atual custa por mês sobre esses pedidos. */
  commissionCents: number;
  /** Mensalidade da faixa correspondente. */
  monthlyFeeCents: number;
  /** Comissão − mensalidade (pode ser negativo em volumes muito pequenos). */
  savingsCents: number;
  /** Economia em 12 meses. */
  yearlySavingsCents: number;
};

/** Calculadora da landing: o que o lojista deixaria de pagar se esses pedidos viessem pelo link. */
export function estimateSavings(input: SavingsInput): SavingsResult {
  const orders = Math.max(0, Math.floor(input.ordersPerMonth));
  const ticket = Math.max(0, Math.round(input.averageTicketCents));
  const pct = Math.min(100, Math.max(0, input.commissionPercent));
  const tier = tierForOrderCount(MONTHLY_TIERS, orders) ?? TOP_MONTHLY_TIER;
  const commissionCents = Math.round((orders * ticket * pct) / 100);
  const savingsCents = commissionCents - tier.priceCents;
  return {
    tier,
    commissionCents,
    monthlyFeeCents: tier.priceCents,
    savingsCents,
    yearlySavingsCents: savingsCents * 12,
  };
}

/**
 * Taxas padrão da Foode no pagamento online (decisão 76, Dono em 2026-11-05), por transação.
 * São o padrão publicado na landing; a tabela vigente por Loja vem do `/ops`. Quando a api
 * expuser as taxas públicas, o valor da api deve bater com estas constantes.
 */
export type PublicFee = { percentBps: number; fixedCents: number };

export const DEFAULT_FEES = {
  pix: { percentBps: 119, fixedCents: 0 },
  cardNormal: { percentBps: 349, fixedCents: 99 },
  cardRapido: { percentBps: 542, fixedCents: 159 },
} as const satisfies Record<string, PublicFee>;

/** "1,19%" ou "3,49% + R$ 0,99". */
export function formatFee(fee: PublicFee): string {
  const pct = `${(fee.percentBps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
  return fee.fixedCents > 0 ? `${pct} + ${formatBRL(fee.fixedCents)}` : pct;
}

/** Prazos de liberação do provedor (decisão 60); o repasse ao lojista é sempre em lote diário. */
export const RELEASE_TERMS = {
  pix: "1 dia útil",
  cardNormal: "Até 21 dias úteis",
  cardRapido: "1 dia útil (D+1)",
  payout: "Lote diário, 1 dia útil após a liberação",
} as const;

export { formatBRL };
