// Regras puras do Estorno e do Ledger no cancelamento (Ticket 12; decisões 39, 60 e 71).
// Centavos inteiros, datas civis de São Paulo. A `api`/`@foode/db` gravam exatamente isto:
//
// - Estorno é sempre TOTAL: devolve tudo o que o Consumidor pagou (total do Pedido + tarifa de
//   serviço). A tarifa (receita da Foode) volta junto (decisão 71).
// - O Ledger nunca apaga nem edita o lançamento do pagamento. O cancelamento grava uma reversão
//   única por lançamento:
//   - ainda não repassado → `annulment`: anula o lançamento no MESMO repasse previsto (o lote do
//     dia não inclui o líquido);
//   - já repassado → `compensated_debit`: débito do líquido compensado nos lotes seguintes da
//     Loja, a partir do 1º dia útil depois do cancelamento.
// - Retentativa do Estorno com espera exponencial limitada; nunca desiste (falha não reabre o
//   Pedido e o Estorno continua devido).
import { expectedPayoutDate, saoPauloDate, type CivilDate } from "../business-days.js";
import { MAX_CENTS } from "../money.js";

/** Estados gravados da obrigação de Estorno (`refunds.state`). */
export const REFUND_RECORD_STATES = ["pending", "requested", "succeeded", "failed"] as const;
export type RefundRecordState = (typeof REFUND_RECORD_STATES)[number];

/** De onde veio a obrigação de Estorno. */
export const REFUND_ORIGINS = ["order_cancelled", "late_payment", "orphan_charge"] as const;
export type RefundOrigin = (typeof REFUND_ORIGINS)[number];

/**
 * Estado público (Painel) a partir do gravado: `requested` (provedor aceitou, aguardando a
 * confirmação) continua "em andamento"; `failed` = "falhou — nova tentativa automática".
 */
export function publicRefundState(
  state: RefundRecordState,
): "pending" | "succeeded" | "failed_retrying" {
  if (state === "succeeded") return "succeeded";
  if (state === "failed") return "failed_retrying";
  return "pending";
}

/** Chave idempotente estável do Estorno: uma por cobrança paga (intenção). */
export function refundIdempotencyKey(intentId: string): string {
  return `refund:${intentId}`;
}

/** Primeira retentativa e teto da espera entre tentativas. */
export const REFUND_RETRY_BASE_MS = 60_000;
export const REFUND_RETRY_MAX_MS = 6 * 60 * 60_000;

/** Espera antes da próxima tentativa depois de `attempts` tentativas falhas (1, 2, 4… min, ≤ 6 h). */
export function refundRetryDelayMs(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) return REFUND_RETRY_BASE_MS;
  const exponent = Math.min(attempts - 1, 30);
  return Math.min(REFUND_RETRY_MAX_MS, REFUND_RETRY_BASE_MS * 2 ** exponent);
}

export function nextRefundAttemptAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + refundRetryDelayMs(attempts));
}

export const LEDGER_REVERSAL_KINDS = ["annulment", "compensated_debit"] as const;
export type LedgerReversalKind = (typeof LEDGER_REVERSAL_KINDS)[number];

/** Lançamento do pagamento a reverter (o que o Ledger gravou na confirmação). */
export type LedgerPaymentEntry = {
  chargedCents: number;
  orderTotalCents: number;
  serviceFeeCents: number;
  foodeFeeCents: number;
  netCents: number;
  expectedPayoutDate: CivilDate;
  /** O lote do repasse com este lançamento já foi pago ao lojista. */
  paidOut: boolean;
};

export type LedgerReversalPlan = {
  kind: LedgerReversalKind;
  /** Devolvido ao Consumidor (= `chargedCents`, inclui a tarifa de serviço). */
  refundedCents: number;
  orderTotalCents: number;
  /** Tarifa de serviço devolvida (sai da receita da Foode). */
  serviceFeeCents: number;
  /** Taxa Foode que deixa de existir sobre este Pedido. */
  foodeFeeCents: number;
  /** Líquido do lojista anulado (antes do repasse) ou debitado (depois). */
  netCents: number;
  /** Repasse em que a reversão conta: o mesmo do lançamento ou o próximo dia útil. */
  expectedPayoutDate: CivilDate;
};

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new RangeError(`refund: ${label} inválido (${value})`);
  }
}

/** Lote em que um débito de Estorno começa a ser compensado: 1º dia útil depois de `at`. */
export function compensationPayoutDate(at: Date): CivilDate {
  return expectedPayoutDate(saoPauloDate(at));
}

export function ledgerReversalKind(paidOut: boolean): LedgerReversalKind {
  return paidOut ? "compensated_debit" : "annulment";
}

/** Reversão do lançamento do pagamento no cancelamento (`at` = instante do cancelamento). */
export function planLedgerReversal(entry: LedgerPaymentEntry, at: Date): LedgerReversalPlan {
  for (const [label, value] of [
    ["chargedCents", entry.chargedCents],
    ["orderTotalCents", entry.orderTotalCents],
    ["serviceFeeCents", entry.serviceFeeCents],
    ["foodeFeeCents", entry.foodeFeeCents],
    ["netCents", entry.netCents],
  ] as const) {
    assertCents(value, label);
  }
  if (
    entry.chargedCents !== entry.orderTotalCents + entry.serviceFeeCents ||
    entry.netCents !== entry.orderTotalCents - entry.foodeFeeCents
  ) {
    throw new RangeError("refund: lançamento com somas inconsistentes");
  }
  const kind = ledgerReversalKind(entry.paidOut);
  return {
    kind,
    refundedCents: entry.chargedCents,
    orderTotalCents: entry.orderTotalCents,
    serviceFeeCents: entry.serviceFeeCents,
    foodeFeeCents: entry.foodeFeeCents,
    netCents: entry.netCents,
    expectedPayoutDate:
      kind === "annulment" ? entry.expectedPayoutDate : compensationPayoutDate(at),
  };
}

/**
 * Saldo do lojista (centavos) a partir dos fatos do Ledger: lançamentos ainda não repassados
 * menos anulações, menos débitos compensáveis. Os já repassados não entram (o dinheiro já foi);
 * seus Estornos viram débito. Pode ficar negativo (débito maior que os lançamentos do lote).
 */
export function storePayoutBalanceCents(
  entries: readonly { netCents: number; paidOut: boolean }[],
  reversals: readonly { kind: LedgerReversalKind; netCents: number }[],
): number {
  let balance = 0;
  for (const entry of entries) if (!entry.paidOut) balance += entry.netCents;
  for (const reversal of reversals) balance -= reversal.netCents;
  return balance;
}
