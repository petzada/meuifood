// Repasses (Dono, só leitura), lotes diários e margem (Ops) — Ticket 14; decisões 60, 61, 62 e 71;
// REL-04, OPS-04. Centavos inteiros; datas civis de São Paulo.
//
// Itens de um lote (o que o Ops paga num Pix por Loja):
// - `entry`: lançamento do pagamento (líquido − retenções do provedor), devido no repasse previsto;
// - `retention`: parcela retida pelo provedor, devida no repasse previsto dela;
// - `debit`: débito de Estorno depois do repasse (`compensated_debit`), compensado no lote;
// - `adjustment`: ajuste auditado do Ops (crédito ou débito), a única correção de lote pago.
// Pendente = ainda sem lote; anulado (Estorno antes do repasse) nunca entra. O lote pago é
// imutável: nada o edita nem apaga; correção = ajuste, que entra no próximo lote.
// A tarifa de serviço (decisão 71) é receita da Foode: nunca entra no líquido nem no lote.
// O Dono nunca vê custo do provedor nem custo do envio (decisão 61).
import { z } from "zod";

import type { CivilDate } from "../business-days.js";
import { MAX_CENTS } from "../money.js";
import { centsSchema } from "../ops/primitives.js";
import { civilDateSchema, civilDaysInclusive, REPORT_MAX_DAYS } from "./period.js";

export const PAYOUT_ITEM_KINDS = ["entry", "retention", "debit", "adjustment"] as const;
export type PayoutItemKind = (typeof PAYOUT_ITEM_KINDS)[number];

/** Conta de saída do Pix de repasse. */
export const PAYOUT_SOURCE_ACCOUNTS = ["efi", "abacatepay"] as const;
export type PayoutSourceAccount = (typeof PAYOUT_SOURCE_ACCOUNTS)[number];

/**
 * Status de uma linha da tela Repasses (REL-04):
 * - `scheduled` Previsto: repasse previsto depois de hoje;
 * - `in_batch` Em lote: previsto até hoje, aguardando o Pix do Ops;
 * - `paid` Pago: entrou num lote pago;
 * - `annulled` Estornado antes do repasse (não será pago);
 * - `refund_debit` Débito de Estorno (Estorno depois do repasse), compensado nos lotes seguintes.
 */
export const PAYOUT_LINE_STATUSES = [
  "scheduled",
  "in_batch",
  "paid",
  "annulled",
  "refund_debit",
] as const;
export type PayoutLineStatus = (typeof PAYOUT_LINE_STATUSES)[number];

export const PAYOUT_LINE_STATUS_LABEL: Record<PayoutLineStatus, string> = {
  scheduled: "Previsto",
  in_batch: "Em lote",
  paid: "Pago",
  annulled: "Estornado antes do repasse",
  refund_debit: "Débito de Estorno",
};

export const PAYOUT_LINE_KINDS = ["payment", "retention", "refund_debit", "adjustment"] as const;
export type PayoutLineKind = (typeof PAYOUT_LINE_KINDS)[number];

/** Status de uma linha a partir dos fatos do Ledger. */
export function payoutLineStatus(input: {
  kind: PayoutLineKind;
  paid: boolean;
  annulled: boolean;
  dueDate: CivilDate | null;
  today: CivilDate;
}): PayoutLineStatus {
  if (input.kind === "refund_debit") return "refund_debit";
  if (input.annulled) return "annulled";
  if (input.paid) return "paid";
  if (input.dueDate === null || input.dueDate <= input.today) return "in_batch";
  return "scheduled";
}

// ---------------------------------------------------------------- Dono (Repasses, só leitura)

/** Período dos Repasses: datas civis do repasse previsto (lançamentos) e do pagamento (lotes). */
export const ownerPayoutsInputSchema = z
  .object({ from: civilDateSchema, to: civilDateSchema })
  .strict()
  .refine((value) => value.from <= value.to, { message: "Início depois do fim.", path: ["to"] })
  .refine((value) => civilDaysInclusive(value.from, value.to) <= REPORT_MAX_DAYS, {
    message: `Período de até ${REPORT_MAX_DAYS} dias.`,
    path: ["to"],
  });
export type OwnerPayoutsInput = z.input<typeof ownerPayoutsInputSchema>;

/** Linha da tela Repasses. Nunca traz custo do provedor nem custo do envio. */
export type PayoutLineView = {
  /** Id do fato (lançamento, retenção, reversão ou ajuste): chave da linha na tela. */
  id: string;
  kind: PayoutLineKind;
  status: PayoutLineStatus;
  /** Número do Pedido (#123); null no ajuste. */
  orderCode: number | null;
  method: "pix" | "credit" | null;
  cardMode: "normal" | "rapido" | null;
  /** Total do Pedido do lojista (base da taxa Foode); 0 em retenção/ajuste. */
  orderTotalCents: number;
  /** Taxa Foode; 0 em retenção/ajuste. */
  foodeFeeCents: number;
  /** Tarifa de serviço do Consumidor (receita da Foode, fora do líquido); 0 fora do pagamento. */
  serviceFeeCents: number;
  /** Valor da linha no repasse: + a receber, − débito (Estorno depois do repasse/ajuste). */
  netCents: number;
  /** Repasse previsto (null no ajuste: entra no próximo lote). */
  expectedPayoutDate: CivilDate | null;
  /** Lote que pagou/compensou; null se ainda não entrou. */
  batchId: string | null;
  /** Motivo do ajuste (texto do Ops); null nas outras linhas. */
  reason: string | null;
  occurredAt: string;
};

export type PayoutStatusTotals = Record<PayoutLineStatus, { count: number; netCents: number }>;

/** Lote pago visto pelo Dono (sem custo do envio). */
export type OwnerPayoutBatchView = {
  id: string;
  /** Lote do dia (data civil dos itens com repasse previsto até ela). */
  payoutDate: CivilDate;
  /** Data do Pix informada pelo Ops. */
  paidOn: CivilDate;
  sourceAccount: PayoutSourceAccount;
  /** Identificador/comprovante do Pix. */
  reference: string;
  entriesCents: number;
  debitsCents: number;
  adjustmentsCents: number;
  amountCents: number;
  itemCount: number;
};

export type OwnerPayoutsView = {
  from: CivilDate;
  to: CivilDate;
  today: CivilDate;
  lines: PayoutLineView[];
  totals: PayoutStatusTotals;
  batches: OwnerPayoutBatchView[];
};

export function payoutStatusTotals(lines: readonly PayoutLineView[]): PayoutStatusTotals {
  const totals = Object.fromEntries(
    PAYOUT_LINE_STATUSES.map((status) => [status, { count: 0, netCents: 0 }]),
  ) as PayoutStatusTotals;
  for (const line of lines) {
    totals[line.status].count += 1;
    totals[line.status].netCents += line.netCents;
  }
  return totals;
}

// ---------------------------------------------------------------- Ops (lotes, ajustes, margem)

/** Item pendente de um lote (valor assinado: débito negativo). */
export type PayoutItem = {
  kind: PayoutItemKind;
  id: string;
  amountCents: number;
};

export type PayoutBatchTotals = {
  /** Lançamentos + retenções (≥ 0). */
  entriesCents: number;
  /** Débitos de Estorno compensados (≥ 0, subtraídos). */
  debitsCents: number;
  /** Ajustes (assinado). */
  adjustmentsCents: number;
  /** Valor do Pix = entries − debits + adjustments. */
  amountCents: number;
  itemCount: number;
};

/** Totais do lote a partir dos itens pendentes. Débito/ajuste com sinal errado = erro. */
export function payoutBatchTotals(items: readonly PayoutItem[]): PayoutBatchTotals {
  let entriesCents = 0;
  let debitsCents = 0;
  let adjustmentsCents = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.amountCents) || Math.abs(item.amountCents) > MAX_CENTS) {
      throw new RangeError(`lote: valor inválido (${item.amountCents})`);
    }
    if (item.kind === "entry" || item.kind === "retention") {
      if (item.amountCents < 0) throw new RangeError("lote: lançamento negativo");
      entriesCents += item.amountCents;
    } else if (item.kind === "debit") {
      if (item.amountCents > 0) throw new RangeError("lote: débito positivo");
      debitsCents -= item.amountCents;
    } else {
      if (item.amountCents === 0) throw new RangeError("lote: ajuste zerado");
      adjustmentsCents += item.amountCents;
    }
  }
  return {
    entriesCents,
    debitsCents,
    adjustmentsCents,
    amountCents: entriesCents - debitsCents + adjustmentsCents,
    itemCount: items.length,
  };
}

/** Lote só é pagável com valor positivo; senão os débitos seguem para os próximos dias. */
export function isPayableBatch(totals: Pick<PayoutBatchTotals, "amountCents">): boolean {
  return totals.amountCents > 0;
}

export type OpsPayoutDueItemView = {
  kind: PayoutItemKind;
  id: string;
  amountCents: number;
  orderCode: number | null;
  method: "pix" | "credit" | null;
  /** Repasse previsto (null no ajuste). */
  expectedPayoutDate: CivilDate | null;
  /** Motivo do ajuste; null nos demais. */
  reason: string | null;
};

/** "A repassar hoje" de uma Loja (OPS-04): itens pendentes com previsão até `asOf`. */
export type OpsPayoutDueStoreView = PayoutBatchTotals & {
  storeId: string;
  storeName: string;
  storeSlug: string;
  /** Conta de repasse cadastrada; null se a Loja não tem cadastro (não dá para pagar). */
  payout: {
    pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random";
    pixKey: string;
    holderName: string;
  } | null;
  payable: boolean;
  items: OpsPayoutDueItemView[];
};

export type OpsPayoutsDueView = {
  /** Data de corte (hoje em São Paulo). */
  asOf: CivilDate;
  /** Repasse só sai em dia útil; fora dele a lista é informativa. */
  isBusinessDay: boolean;
  stores: OpsPayoutDueStoreView[];
};

const referenceSchema = z.string().trim().min(1).max(120);

/**
 * Marcar lote pago (OPS-04). `asOf` = corte que a tela mostrou (itens com previsão até ele);
 * `expectedAmountCents` = valor do resumo confirmado: se o lote mudou no meio (novo Estorno,
 * outro lote), a api responde `conflict` sem gravar. `idempotencyKey` (UUID do formulário):
 * repetir o mesmo pedido devolve o mesmo lote, sem pagar duas vezes.
 */
export const opsPayoutMarkPaidInputSchema = z
  .object({
    storeId: z.uuid(),
    asOf: civilDateSchema,
    paidOn: civilDateSchema,
    sourceAccount: z.enum(PAYOUT_SOURCE_ACCOUNTS),
    reference: referenceSchema,
    transferCostCents: centsSchema.max(MAX_CENTS),
    expectedAmountCents: z.number().int().min(1).max(MAX_CENTS),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .refine((value) => value.paidOn >= value.asOf, {
    message: "O Pix não pode ser anterior ao lote.",
    path: ["paidOn"],
  });
export type OpsPayoutMarkPaidInput = z.input<typeof opsPayoutMarkPaidInputSchema>;

export type OpsPayoutMarkPaidResult = {
  batchId: string;
  amountCents: number;
  itemCount: number;
  /** true = a mesma `idempotencyKey` já tinha gravado este lote (nada novo foi pago). */
  replayed: boolean;
};

export const PAYOUT_ADJUSTMENT_REASON_MIN = 3;
export const PAYOUT_ADJUSTMENT_REASON_MAX = 200;

/**
 * Lançamento de ajuste (única correção de lote pago): crédito (+) ou débito (−) ao lojista, com
 * motivo e, opcionalmente, o lote corrigido. Entra no próximo lote da Loja. Auditado.
 */
export const opsPayoutAdjustmentInputSchema = z
  .object({
    storeId: z.uuid(),
    amountCents: z
      .number()
      .int()
      .min(-MAX_CENTS)
      .max(MAX_CENTS)
      .refine((value) => value !== 0, "Ajuste não pode ser zero."),
    reason: z.string().trim().min(PAYOUT_ADJUSTMENT_REASON_MIN).max(PAYOUT_ADJUSTMENT_REASON_MAX),
    batchId: z.uuid().nullable().default(null),
  })
  .strict();
export type OpsPayoutAdjustmentInput = z.input<typeof opsPayoutAdjustmentInputSchema>;

/** Lotes de uma Loja no período (data do Pix). */
export const opsPayoutBatchesInputSchema = z
  .object({ storeId: z.uuid(), from: civilDateSchema, to: civilDateSchema })
  .strict()
  .refine((value) => value.from <= value.to, { message: "Início depois do fim.", path: ["to"] })
  .refine((value) => civilDaysInclusive(value.from, value.to) <= REPORT_MAX_DAYS, {
    message: `Período de até ${REPORT_MAX_DAYS} dias.`,
    path: ["to"],
  });
export type OpsPayoutBatchesInput = z.input<typeof opsPayoutBatchesInputSchema>;

/** Lote visto pelo Ops: inclui custo do envio e quem marcou. */
export type OpsPayoutBatchView = OwnerPayoutBatchView & {
  storeId: string;
  transferCostCents: number;
  createdByUserId: string;
  createdAt: string;
};

/** Margem por Loja e período (Ops): datas civis dos fatos. */
export const opsMarginInputSchema = z
  .object({ from: civilDateSchema, to: civilDateSchema })
  .strict()
  .refine((value) => value.from <= value.to, { message: "Início depois do fim.", path: ["to"] })
  .refine((value) => civilDaysInclusive(value.from, value.to) <= REPORT_MAX_DAYS, {
    message: `Período de até ${REPORT_MAX_DAYS} dias.`,
    path: ["to"],
  });
export type OpsMarginInput = z.input<typeof opsMarginInputSchema>;

/** Agregado do D1 por Loja no período. */
export type MarginAggregateRow = {
  storeId: string;
  storeName: string;
  /** Pagamentos online confirmados no período. */
  payments: number;
  foodeFeeCents: number;
  /** Taxa Foode devolvida por Estorno no período. */
  refundedFoodeFeeCents: number;
  serviceFeeCents: number;
  refundedServiceFeeCents: number;
  providerCostCents: number;
  /** Pagamentos sem custo do provedor conhecido (a margem fica otimista). */
  providerCostUnknown: number;
  transferCostCents: number;
  batches: number;
};

export type OpsMarginRow = {
  storeId: string;
  storeName: string;
  payments: number;
  /** Taxa Foode líquida de Estornos. */
  foodeFeeCents: number;
  providerCostCents: number;
  providerCostUnknown: number;
  transferCostCents: number;
  batches: number;
  /** taxa Foode − custo do provedor − custo do envio (pode ser negativa). */
  marginCents: number;
  /** Tarifa de serviço líquida de Estornos: receita da Foode, SEPARADA da margem (decisão 71). */
  serviceFeeCents: number;
};

export type OpsMarginView = {
  from: CivilDate;
  to: CivilDate;
  stores: OpsMarginRow[];
  totals: Omit<OpsMarginRow, "storeId" | "storeName">;
};

/** Margem = taxa Foode (líquida de Estornos) − custo do provedor − custo do envio. */
export function marginRow(row: MarginAggregateRow): OpsMarginRow {
  for (const [label, value] of Object.entries(row)) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`margem: ${label} inválido (${value})`);
    }
  }
  const foodeFeeCents = row.foodeFeeCents - row.refundedFoodeFeeCents;
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    payments: row.payments,
    foodeFeeCents,
    providerCostCents: row.providerCostCents,
    providerCostUnknown: row.providerCostUnknown,
    transferCostCents: row.transferCostCents,
    batches: row.batches,
    marginCents: foodeFeeCents - row.providerCostCents - row.transferCostCents,
    serviceFeeCents: row.serviceFeeCents - row.refundedServiceFeeCents,
  };
}

export function buildMarginView(
  from: CivilDate,
  to: CivilDate,
  rows: readonly MarginAggregateRow[],
): OpsMarginView {
  const stores = rows
    .map(marginRow)
    .sort((a, b) => b.marginCents - a.marginCents || a.storeName.localeCompare(b.storeName));
  const totals: OpsMarginView["totals"] = {
    payments: 0,
    foodeFeeCents: 0,
    providerCostCents: 0,
    providerCostUnknown: 0,
    transferCostCents: 0,
    batches: 0,
    marginCents: 0,
    serviceFeeCents: 0,
  };
  for (const store of stores) {
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += store[key];
  }
  return { from, to, stores, totals };
}
