// Rótulos e regras de apresentação do Financeiro do Dono e dos lotes do Ops (Ticket 14). Puro:
// serve às páginas, aos componentes e aos testes. A regra de negócio (período, comparativo,
// totais, status) vem de `@foode/shared/finance`; aqui só o que é apresentação do Painel
// (texto do período na URL, rótulos PT-BR, datas de São Paulo, nome do atalho).
import {
  addCivilDays,
  isCivilDate,
  type PayoutItemKind,
  type PayoutLineKind,
  type PayoutSourceAccount,
  REPORT_PRESETS,
  type ReportPeriodInput,
  type ReportPreset,
  reportPeriodInputSchema,
} from "@foode/shared/finance";
import type { FunnelEvent } from "@foode/shared/onboarding";
import type { Fulfillment, OrderStatus, PaymentMethod } from "@foode/shared/order";

import { SAO_PAULO_TZ } from "./ops-format";

// ---------------------------------------------------------------- Período (REL-01)

/** Rótulo dos atalhos do seletor de período, na ordem da tela. */
export const REPORT_PRESET_LABEL: Record<ReportPreset, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  month: "Mês atual",
  custom: "Personalizado",
};

/** Atalhos oferecidos como botões (Personalizado abre os campos de data). */
export const REPORT_QUICK_PRESETS = REPORT_PRESETS.filter(
  (preset): preset is Exclude<ReportPreset, "custom"> => preset !== "custom",
);

export type SearchParamsLike = Record<string, string | string[] | undefined>;

function param(params: SearchParamsLike, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

/**
 * Período a partir da query (`?periodo=7d` ou `?periodo=custom&de=…&ate=…`). Query ausente ou
 * inválida = `today` (a tela nunca quebra por URL editada; o servidor valida de novo).
 */
export function periodFromSearchParams(params: SearchParamsLike): ReportPeriodInput {
  const preset = param(params, "periodo") ?? "today";
  const candidate =
    preset === "custom"
      ? { preset, from: param(params, "de") ?? "", to: param(params, "ate") ?? "" }
      : { preset };
  const parsed = reportPeriodInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : { preset: "today" };
}

/** Query de `/relatorios` para um período (inverso de `periodFromSearchParams`). */
export function periodToQuery(period: ReportPeriodInput): string {
  const query = new URLSearchParams({ periodo: period.preset });
  if (period.preset === "custom") {
    query.set("de", period.from);
    query.set("ate", period.to);
  }
  return query.toString();
}

/** "2026-11-05" → "05/11/2026". */
export function formatCivilDate(date: string): string {
  if (!isCivilDate(date)) return date;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** "05/11/2026 a 11/11/2026" (ou só a data quando é um dia). */
export function formatCivilRange(from: string, to: string): string {
  return from === to ? formatCivilDate(from) : `${formatCivilDate(from)} a ${formatCivilDate(to)}`;
}

const civilSp = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil de São Paulo (`YYYY-MM-DD`) do instante: valor inicial dos campos de data. */
export function saoPauloToday(now = new Date()): string {
  return civilSp.format(now);
}

/** Período inicial dos Repasses: 30 dias atrás até 14 dias à frente (previstos aparecem). */
export function defaultPayoutRange(today: string): { from: string; to: string } {
  return { from: addCivilDays(today, -30), to: addCivilDays(today, 14) };
}

/** Período inicial de lotes/margem do Ops: últimos 30 dias até hoje. */
export function defaultPastRange(today: string): { from: string; to: string } {
  return { from: addCivilDays(today, -29), to: today };
}

/**
 * Intervalo civil vindo da query (`?de=…&ate=…`); inválido ou invertido = `fallback`. O
 * limite de dias é conferido pelo Zod do contrato na chamada.
 */
export function rangeFromSearchParams(
  params: SearchParamsLike,
  fallback: { from: string; to: string },
): { from: string; to: string } {
  const from = param(params, "de");
  const to = param(params, "ate");
  if (!from || !to || !isCivilDate(from) || !isCivilDate(to) || from > to) return fallback;
  return { from, to };
}

// ---------------------------------------------------------------- Relatórios

export const REPORT_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const REPORT_FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  delivery: "Delivery",
  pickup: "Retirada",
};

export const REPORT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  credit: "Cartão de crédito",
  on_delivery: "Pagamento na entrega",
};

export const FUNNEL_STEP_LABEL: Record<FunnelEvent, string> = {
  visit: "Visitas",
  item_view: "Viram um item",
  add_to_cart: "Adicionaram ao carrinho",
  checkout_start: "Iniciaram o checkout",
  order: "Fizeram Pedido",
};

export const FUNNEL_STEPS: readonly FunnelEvent[] = [
  "visit",
  "item_view",
  "add_to_cart",
  "checkout_start",
  "order",
];

/** Dom–Sáb na ordem do `WeekdayCounts` (índice 0 = domingo). */
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const WEEKDAY_LONG = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Definição de GMV do glossário (REL-01: nota/`title` ao lado da métrica). */
export const GMV_DEFINITION =
  "GMV: total dos Pedidos Concluídos pagos online (PIX ou cartão). Só métrica; não entra no repasse.";

/** 1234 → "1.234" (contagens). */
const integer = new Intl.NumberFormat("pt-BR");
export function formatCount(value: number): string {
  return integer.format(value);
}

/** Basis points → "12,3%" (conversão do funil); null → "—". */
export function formatBpsPercent(bps: number | null): string {
  if (bps === null) return "—";
  const tenths = Math.round(bps / 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  return `${whole}${fraction === 0 ? "" : `,${fraction}`}%`;
}

// ---------------------------------------------------------------- Repasses e lotes

export const PAYOUT_LINE_KIND_LABEL: Record<PayoutLineKind, string> = {
  payment: "Pagamento",
  retention: "Retenção do provedor",
  refund_debit: "Débito de Estorno",
  adjustment: "Ajuste",
};

export const PAYOUT_ITEM_KIND_LABEL: Record<PayoutItemKind, string> = {
  entry: "Lançamento",
  retention: "Retenção",
  debit: "Débito de Estorno",
  adjustment: "Ajuste",
};

export const PAYOUT_SOURCE_ACCOUNT_LABEL: Record<PayoutSourceAccount, string> = {
  efi: "Efí",
  abacatepay: "AbacatePay",
};

export const PAYOUT_METHOD_LABEL: Record<"pix" | "credit", string> = {
  pix: "PIX",
  credit: "Crédito",
};

/** Símbolo textual por status da linha de Repasse (T-03: nunca só cor). */
export const PAYOUT_LINE_STATUS_GLYPH = {
  scheduled: "◔",
  in_batch: "◑",
  paid: "●",
  annulled: "○",
  refund_debit: "▼",
} as const;

export const PAYOUT_LINE_STATUS_CLASSES = {
  scheduled: "border-[var(--color-hairline)] text-[var(--color-body)]",
  in_batch: "border-[var(--color-accent)] text-[#7a5600]",
  paid: "border-[#2e7d32] text-[#1f5f23]",
  annulled: "border-[var(--color-hairline)] text-[var(--color-muted)]",
  refund_debit: "border-[var(--color-error)] text-[var(--color-error)]",
} as const;

/** Valor assinado: "+ R$ 10,00" / "− R$ 3,00" (sinal textual, nunca só cor). */
export function formatSignedCents(cents: number, format: (abs: number) => string): string {
  if (cents === 0) return format(0);
  return `${cents < 0 ? "− " : "+ "}${format(Math.abs(cents))}`;
}

/**
 * Resumo da confirmação de "Marcar lote pago" (OPS-04): o que muda e quando, com os números que
 * o Ops está prestes a confirmar.
 */
export function markPaidSummary(input: {
  storeName: string;
  amountLabel: string;
  itemCount: number;
  entriesLabel: string;
  debitsLabel: string;
  adjustmentsLabel: string | null;
  paidOn: string;
  sourceAccount: PayoutSourceAccount;
  reference: string;
  transferCostLabel: string;
}): string {
  const items = `${input.itemCount} ${input.itemCount === 1 ? "item" : "itens"}`;
  const adjustments = input.adjustmentsLabel ? `, ajustes ${input.adjustmentsLabel}` : "";
  return (
    `Marcar como pago o lote de ${input.storeName}: ${input.amountLabel} (${items}; lançamentos ` +
    `${input.entriesLabel}, débitos de Estorno ${input.debitsLabel}${adjustments}), Pix de ` +
    `${formatCivilDate(input.paidOn)} pela conta ${PAYOUT_SOURCE_ACCOUNT_LABEL[input.sourceAccount]}, ` +
    `identificador "${input.reference}", custo do envio ${input.transferCostLabel}. ` +
    "Depois de confirmado o lote não pode ser editado nem apagado: correção só por ajuste."
  );
}
