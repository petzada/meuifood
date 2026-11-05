// Taxa Foode (decisões 60/61) e custos dos provedores (ADR 0007). Taxa Foode: padrão por
// meio/modo + override por Loja, sempre com vigência, nascendo VAZIA (meio sem taxa vigente
// fica fora do checkout; nenhum número em código). Custos do provedor: só o Ops vê.
import { z } from "zod";

import { cardModeSchema } from "./stores.js";
import {
  basisPointsSchema,
  centsSchema,
  findOverlap,
  periodInputShape,
  utcInstantSchema,
  VALID_TO_MESSAGE,
  validToAfterValidFrom,
} from "./primitives.js";

/** Meios online com taxa Foode (o enum do checkout ainda tem `on_delivery`, sem taxa). */
export const FEE_PAYMENT_METHODS = ["pix", "credit"] as const;
export type FeePaymentMethod = (typeof FEE_PAYMENT_METHODS)[number];
export const feePaymentMethodSchema = z.enum(FEE_PAYMENT_METHODS);

/** Chave da taxa: PIX não tem modo; Crédito exige o modo (Normal/Rápido). */
export type FeeKey =
  { method: "pix"; cardMode: null } | { method: "credit"; cardMode: "normal" | "rapido" };

export function feeKeyOf(fee: { method: string; cardMode: string | null }): string {
  return `${fee.method}:${fee.cardMode ?? "-"}`;
}

/** Uma linha de taxa Foode: % (bp) + fixo (centavos), com vigência. */
export const paymentFeeEntrySchema = z
  .object({
    method: feePaymentMethodSchema,
    cardMode: cardModeSchema.nullable().default(null),
    percentBps: basisPointsSchema,
    fixedCents: centsSchema.default(0),
    ...periodInputShape,
  })
  .refine((fee) => (fee.method === "credit") === (fee.cardMode !== null), {
    path: ["cardMode"],
    message: "Crédito exige o modo do cartão; PIX não tem modo.",
  })
  .refine(validToAfterValidFrom, { path: ["validTo"], message: VALID_TO_MESSAGE });

export type PaymentFeeEntry = z.output<typeof paymentFeeEntrySchema>;

/** Vigências sobrepostas para a mesma chave (meio/modo)? Índices do primeiro par. */
export function findFeeOverlap<
  T extends { method: string; cardMode: string | null; validFrom: string; validTo: string | null },
>(fees: readonly T[]): [number, number] | null {
  const byKey = new Map<string, number[]>();
  fees.forEach((fee, index) => {
    const key = feeKeyOf(fee);
    byKey.set(key, [...(byKey.get(key) ?? []), index]);
  });
  for (const indexes of byKey.values()) {
    const hit = findOverlap(indexes.map((i) => fees[i]!));
    if (hit) return [indexes[hit[0]]!, indexes[hit[1]]!];
  }
  return null;
}

/**
 * Cadastrar taxas Foode: `storeId` null = tabela padrão; uuid = override da Loja. A api confere
 * de novo a sobreposição contra o que já está gravado (mesma `findFeeOverlap`).
 */
export const opsCreatePaymentFeesInputSchema = z
  .object({
    storeId: z.uuid().nullable(),
    fees: z.array(paymentFeeEntrySchema).min(1).max(20),
  })
  .superRefine((input, ctx) => {
    const hit = findFeeOverlap(input.fees);
    if (hit) {
      ctx.addIssue({
        code: "custom",
        path: ["fees", hit[1]],
        message: "Vigência sobreposta com outra taxa do mesmo meio/modo.",
      });
    }
  });

/** Encerrar a vigência de uma taxa (nunca apaga nem reescreve o valor). */
export const opsEndPaymentFeeInputSchema = z.object({
  feeId: z.uuid(),
  validTo: utcInstantSchema,
});

export const opsListPaymentFeesInputSchema = z.object({
  /** null = tabela padrão; uuid = overrides da Loja. */
  storeId: z.uuid().nullable(),
});

// ---- Custos dos provedores (Ops-only) ----

export const PAYMENT_PROVIDERS = ["abacatepay", "efi"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS);

/** Operações com custo: receber PIX, cobrar cartão, enviar Pix de repasse. */
export const PROVIDER_OPERATIONS = ["pix_charge", "card_charge", "pix_payout"] as const;
export type ProviderOperation = (typeof PROVIDER_OPERATIONS)[number];
export const providerOperationSchema = z.enum(PROVIDER_OPERATIONS);

/** Operações que cada provedor faz no arranjo da decisão 60 (PIX de recebimento só AbacatePay). */
export const PROVIDER_OPERATIONS_BY_PROVIDER: Readonly<
  Record<PaymentProvider, readonly ProviderOperation[]>
> = {
  abacatepay: ["pix_charge", "card_charge", "pix_payout"],
  efi: ["card_charge", "pix_payout"],
};

export const providerCostEntrySchema = z
  .object({
    provider: paymentProviderSchema,
    operation: providerOperationSchema,
    percentBps: basisPointsSchema,
    fixedCents: centsSchema.default(0),
    ...periodInputShape,
  })
  .refine((cost) => PROVIDER_OPERATIONS_BY_PROVIDER[cost.provider].includes(cost.operation), {
    path: ["operation"],
    message: "Operação não feita por este provedor.",
  })
  .refine(validToAfterValidFrom, { path: ["validTo"], message: VALID_TO_MESSAGE });

export type ProviderCostEntry = z.output<typeof providerCostEntrySchema>;

export const opsCreateProviderCostInputSchema = providerCostEntrySchema;

export const opsEndProviderCostInputSchema = z.object({
  costId: z.uuid(),
  validTo: utcInstantSchema,
});

/** Vigência dos custos semeados pela migration 0002 (`provider_costs`). */
export const PROVIDER_COSTS_SEED_VALID_FROM = "2026-11-01T00:00:00.000Z";

/** Custos atuais (Ticket 29 / decisão 60). A migration 0002 semeia exatamente isto. */
export const PROVIDER_COSTS_SEED = [
  { provider: "abacatepay", operation: "pix_charge", percentBps: 0, fixedCents: 54 },
  { provider: "abacatepay", operation: "pix_payout", percentBps: 0, fixedCents: 80 },
  { provider: "abacatepay", operation: "card_charge", percentBps: 542, fixedCents: 60 },
  { provider: "efi", operation: "card_charge", percentBps: 349, fixedCents: 0 },
  { provider: "efi", operation: "pix_payout", percentBps: 119, fixedCents: 0 },
] as const satisfies readonly {
  provider: PaymentProvider;
  operation: ProviderOperation;
  percentBps: number;
  fixedCents: number;
}[];

export type OpsCreatePaymentFeesInput = z.input<typeof opsCreatePaymentFeesInputSchema>;
export type OpsEndPaymentFeeInput = z.input<typeof opsEndPaymentFeeInputSchema>;
export type OpsListPaymentFeesInput = z.input<typeof opsListPaymentFeesInputSchema>;
export type OpsCreateProviderCostInput = z.input<typeof opsCreateProviderCostInputSchema>;
export type OpsEndProviderCostInput = z.input<typeof opsEndProviderCostInputSchema>;
