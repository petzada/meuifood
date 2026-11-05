// Formulários do Financeiro (Ticket 14): lê o FormData do navegador, converte R$ para centavos e
// valida com os Zod do contrato (`@foode/shared/finance`); a api valida e autoriza de novo.
// Erros por campo em PT-BR, no mesmo formato de `ops-forms.ts`.
import {
  opsPayoutAdjustmentInputSchema,
  opsPayoutMarkPaidInputSchema,
  PAYOUT_ADJUSTMENT_REASON_MAX,
  PAYOUT_ADJUSTMENT_REASON_MIN,
  type OpsPayoutAdjustmentInput,
  type OpsPayoutMarkPaidInput,
} from "@foode/shared/finance";

import { parseMoneyToCents } from "./ops-format";
import { type FormLike, type FormState, type ParseResult, parseWith, text } from "./ops-forms";

/** Estado de "Marcar lote pago": `conflict` = o lote mudou; a tela recarrega e pede nova conferência. */
export type MarkPaidState = FormState & { conflict?: boolean };

export const MARK_PAID_CONFLICT_MESSAGE =
  "O lote mudou desde que você abriu esta tela (novo Estorno, ajuste ou outro lote). Confira os valores atualizados e marque de novo.";

const MARK_PAID_MESSAGES: Record<string, string> = {
  paidOn: "Informe a data do Pix.",
  sourceAccount: "Escolha a conta de saída.",
  reference: "Informe o identificador ou comprovante do Pix (até 120 caracteres).",
  transferCostCents: "Informe o custo do envio em R$ (0,00 se não houve).",
  expectedAmountCents: "O lote precisa ter valor positivo.",
  idempotencyKey: "Recarregue a página e tente de novo.",
  storeId: "Recarregue a página e tente de novo.",
  asOf: "Recarregue a página e tente de novo.",
};

/** Campo de R$ → centavos; vazio = 0; inválido vira NaN para o Zod recusar no campo certo. */
function money(form: FormLike, name: string): number {
  const raw = text(form, name).trim();
  if (!raw) return 0;
  return parseMoneyToCents(raw) ?? Number.NaN;
}

function integer(form: FormLike, name: string): number {
  const raw = text(form, name).trim();
  return /^-?\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

/** "Marcar lote pago" (OPS-04): data, conta, identificador e custo do envio + o lote confirmado. */
export function parseMarkPaid(form: FormLike): ParseResult<OpsPayoutMarkPaidInput> {
  return parseWith(
    opsPayoutMarkPaidInputSchema,
    {
      storeId: text(form, "storeId"),
      asOf: text(form, "asOf"),
      paidOn: text(form, "paidOn"),
      sourceAccount: text(form, "sourceAccount"),
      reference: text(form, "reference").trim(),
      transferCostCents: money(form, "transferCostCents"),
      expectedAmountCents: integer(form, "expectedAmountCents"),
      idempotencyKey: text(form, "idempotencyKey"),
    },
    MARK_PAID_MESSAGES,
  );
}

const ADJUSTMENT_MESSAGES: Record<string, string> = {
  amountCents: "Informe o valor do ajuste em R$ (maior que zero).",
  "custom:Ajuste não pode ser zero.": "Informe o valor do ajuste em R$ (maior que zero).",
  reason: `Descreva o motivo (${PAYOUT_ADJUSTMENT_REASON_MIN} a ${PAYOUT_ADJUSTMENT_REASON_MAX} caracteres).`,
  direction: "Escolha se é crédito ou débito ao lojista.",
  batchId: "Lote inválido.",
  storeId: "Escolha a Loja.",
};

/**
 * Ajuste auditado: `direction` (credit/debit) + valor em R$ viram `amountCents` assinado;
 * `batchId` opcional (lote corrigido).
 */
export function parseAdjustment(form: FormLike): ParseResult<OpsPayoutAdjustmentInput> {
  const direction = text(form, "direction");
  if (direction !== "credit" && direction !== "debit") {
    return { ok: false, errors: { direction: ADJUSTMENT_MESSAGES.direction! } };
  }
  const abs = money(form, "amountCents");
  const batchId = text(form, "batchId").trim();
  return parseWith(
    opsPayoutAdjustmentInputSchema,
    {
      storeId: text(form, "storeId"),
      amountCents: direction === "debit" ? -abs : abs,
      reason: text(form, "reason").trim(),
      batchId: batchId || null,
    },
    ADJUSTMENT_MESSAGES,
  );
}
