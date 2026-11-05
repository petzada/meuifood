// Plano e faixas por Pedidos (decisão 61): faixas pela quantidade de Pedidos não cancelados do
// Canal próprio no mês civil, 15% abaixo do Anota AI; anual com Pedidos ilimitados. Tabela
// editável no `/ops` com vigência; cobrança fora do app (a faixa é informativa).
import { z } from "zod";

import { centsSchema, utcInstantSchema } from "./primitives.js";

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const billingCycleSchema = z.enum(BILLING_CYCLES);

/**
 * Faixa mensal: de `minOrders` a `maxOrders` Pedidos no mês (inclusive); `maxOrders` null =
 * sem teto. `priceCents` = Mensalidade do mês.
 */
export const planTierSchema = z
  .object({
    minOrders: z.number().int().nonnegative(),
    maxOrders: z.number().int().positive().nullable(),
    priceCents: centsSchema,
  })
  .refine((tier) => tier.maxOrders === null || tier.maxOrders >= tier.minOrders, {
    message: "Fim da faixa antes do início.",
  });

export type PlanTier = z.output<typeof planTierSchema>;

/** Faixas contíguas: começam em 0, sem buraco nem sobreposição, só a última sem teto. */
export function tiersAreContiguous(tiers: readonly PlanTier[]): boolean {
  if (tiers.length === 0 || tiers[0]!.minOrders !== 0) return false;
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]!;
    const next = tiers[i + 1];
    if (!next) return tier.maxOrders === null;
    if (tier.maxOrders === null || next.minOrders !== tier.maxOrders + 1) return false;
  }
  return true;
}

/**
 * Publicar uma nova tabela de faixas a partir de `validFrom`. A tabela vigente passa a terminar
 * em `validFrom` (histórico preservado); não há edição de tabela publicada.
 */
export const opsPublishPlanTiersInputSchema = z
  .object({
    validFrom: utcInstantSchema,
    monthlyTiers: z.array(planTierSchema).min(1).max(10),
    /** Preço do ano inteiro (Pedidos ilimitados). Ex.: 12 × R$ 84,99 = 101988. */
    annualPriceCents: centsSchema,
  })
  .refine((input) => tiersAreContiguous(input.monthlyTiers), {
    path: ["monthlyTiers"],
    message: "Faixas devem começar em 0, ser contíguas e só a última ficar sem teto.",
  });

/** Plano da Loja com vigência: o novo encerra o anterior em `validFrom`. */
export const opsSetStorePlanInputSchema = z.object({
  storeId: z.uuid(),
  cycle: billingCycleSchema,
  validFrom: utcInstantSchema,
});

/** Faixa em que cai a contagem de Pedidos do mês; null se a tabela não cobre. */
export function tierForOrderCount<T extends PlanTier>(
  tiers: readonly T[],
  orders: number,
): T | null {
  return (
    tiers.find(
      (tier) => orders >= tier.minOrders && (tier.maxOrders === null || orders <= tier.maxOrders),
    ) ?? null
  );
}

/** Vigência da tabela semeada pela migration 0002 (`plan_price_tiers`). */
export const PLAN_TIERS_SEED_VALID_FROM = "2026-11-01T00:00:00.000Z";

/** Valores iniciais da decisão 61 (Anota −15%). A migration 0002 semeia exatamente isto. */
export const PLAN_TIERS_SEED = {
  monthlyTiers: [
    { minOrders: 0, maxOrders: 150, priceCents: 8499 },
    { minOrders: 151, maxOrders: 250, priceCents: 16999 },
    { minOrders: 251, maxOrders: null, priceCents: 25499 },
  ],
  annualPriceCents: 101988,
} as const satisfies { monthlyTiers: readonly PlanTier[]; annualPriceCents: number };

export type OpsPublishPlanTiersInput = z.input<typeof opsPublishPlanTiersInputSchema>;
export type OpsSetStorePlanInput = z.input<typeof opsSetStorePlanInputSchema>;
