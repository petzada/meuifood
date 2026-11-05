// Relatórios do Dono (Ticket 14; REL-01/REL-02, P-REL-2..5, decisões 63, 64 e 71). A api agrega no
// D1 (GROUP BY, sem N+1) e monta a visão com as funções puras daqui; o admin só formata.
//
// - Pedidos contados = os que o Painel enxerga (pagos ou sem pagamento online), criados no período
//   civil de São Paulo. "Total vendido" = `total_cents` dos não cancelados (itens + Delivery −
//   Cupom). A tarifa de serviço do pagamento online NÃO entra: é receita da Foode (decisão 71).
// - GMV (glossário): total dos Pedidos Concluídos pagos online (PIX/Crédito); só métrica.
// - Top 10 itens por quantidade, com quebra Dom–Sáb (dia da semana em São Paulo).
// - TOP 10 clientes por valor: SÓ Consumidores com conta na Foode e Pedidos da própria Loja; Guest
//   nunca aparece. Só nome, quantidade de Pedidos e total — sem telefone, CPF, endereço ou id.
//   Sem exportação (decisão 64). Base legal (LGPD art. 7º, V e IX): execução do contrato de
//   fornecimento entre Consumidor e Loja e legítimo interesse do Dono em conhecer os próprios
//   clientes recorrentes, com dado mínimo (nome) e só da própria Loja.
// - Funil próprio (P-REL-4): contadores agregados do Ticket 28, sem dado pessoal.
import { z } from "zod";

import type { FunnelReport } from "../onboarding/funnel.js";
import {
  FULFILLMENTS,
  type Fulfillment,
  ONLINE_PAYMENT_METHODS,
  ORDER_STATUSES,
  type OrderStatus,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "../order/status.js";
import { compareMetric, type MetricComparison } from "./comparison.js";
import { type ResolvedReportPeriod, reportPeriodInputSchema } from "./period.js";

/** Entrada de `reportsGet`/`reportsExportCsv`: o período (atalho ou Personalizado). */
export const reportInputSchema = z.object({ period: reportPeriodInputSchema }).strict();
export type ReportInput = z.input<typeof reportInputSchema>;

export const TOP_ITEMS_LIMIT = 10;
export const TOP_CUSTOMERS_LIMIT = 10;

/** Agregado do D1: Pedidos por (status, Fulfillment, meio) no período. */
export type ReportOrderAggregateRow = {
  status: OrderStatus;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  orders: number;
  totalCents: number;
};

export type ReportSummary = {
  /** Pedidos não cancelados. */
  orders: number;
  cancelled: number;
  /** Total vendido (não cancelados), sem a tarifa de serviço. */
  totalSoldCents: number;
  /** Total vendido ÷ Pedidos, arredondado; 0 sem Pedidos. */
  averageTicketCents: number;
  /** Concluídos pagos online (PIX/Crédito); só métrica. */
  gmvCents: number;
};

export type ReportBreakdownRow<K extends string> = { key: K; orders: number; totalCents: number };

export type ReportComparison = Record<
  "orders" | "cancelled" | "totalSoldCents" | "averageTicketCents",
  MetricComparison
>;

/** Contagem por dia da semana: índice 0 = domingo … 6 = sábado. */
export type WeekdayCounts = [number, number, number, number, number, number, number];

/** Agregado do D1: item × dia da semana (São Paulo), Pedidos não cancelados. */
export type ReportItemWeekdayRow = {
  /** Item do Cardápio (ou o nome, se o item não existe mais). */
  itemKey: string;
  itemName: string;
  weekday: number;
  quantity: number;
  totalCents: number;
};

export type ReportTopItem = {
  rank: number;
  name: string;
  quantity: number;
  totalCents: number;
  byWeekday: WeekdayCounts;
};

/** Agregado do D1: só contas da Foode com Pedido na Loja (Guest nunca entra). */
export type ReportCustomerRow = { name: string; orders: number; totalCents: number };

/** Linha do TOP 10 clientes: nome, quantidade e total. Nada mais (nem id, nem contato). */
export type ReportTopCustomer = { rank: number; name: string; orders: number; totalCents: number };

export type FinanceReport = {
  period: ResolvedReportPeriod;
  summary: ReportSummary;
  previousSummary: ReportSummary;
  comparison: ReportComparison;
  byStatus: ReportBreakdownRow<OrderStatus>[];
  byFulfillment: ReportBreakdownRow<Fulfillment>[];
  byPaymentMethod: ReportBreakdownRow<PaymentMethod>[];
  topItems: ReportTopItem[];
  topCustomers: ReportTopCustomer[];
  funnel: FunnelReport;
  /** Nenhum Pedido (nem cancelado) no período: a tela mostra "Nenhum Pedido neste período". */
  empty: boolean;
};

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`relatório: ${label} inválido (${value})`);
  }
}

export function reportSummary(rows: readonly ReportOrderAggregateRow[]): ReportSummary {
  let orders = 0;
  let cancelled = 0;
  let totalSoldCents = 0;
  let gmvCents = 0;
  const online: readonly string[] = ONLINE_PAYMENT_METHODS;
  for (const row of rows) {
    assertCount(row.orders, "orders");
    assertCount(row.totalCents, "totalCents");
    if (row.status === "cancelled") {
      cancelled += row.orders;
      continue;
    }
    orders += row.orders;
    totalSoldCents += row.totalCents;
    if (row.status === "completed" && online.includes(row.paymentMethod)) {
      gmvCents += row.totalCents;
    }
  }
  return {
    orders,
    cancelled,
    totalSoldCents,
    averageTicketCents: orders === 0 ? 0 : Math.floor((totalSoldCents * 2 + orders) / (orders * 2)),
    gmvCents,
  };
}

export function reportComparison(
  current: ReportSummary,
  previous: ReportSummary,
): ReportComparison {
  return {
    orders: compareMetric(current.orders, previous.orders),
    cancelled: compareMetric(current.cancelled, previous.cancelled),
    totalSoldCents: compareMetric(current.totalSoldCents, previous.totalSoldCents),
    averageTicketCents: compareMetric(current.averageTicketCents, previous.averageTicketCents),
  };
}

function breakdown<K extends string>(
  keys: readonly K[],
  rows: readonly ReportOrderAggregateRow[],
  keyOf: (row: ReportOrderAggregateRow) => K,
  include: (row: ReportOrderAggregateRow) => boolean,
): ReportBreakdownRow<K>[] {
  const map = new Map(keys.map((key) => [key, { key, orders: 0, totalCents: 0 }]));
  for (const row of rows) {
    if (!include(row)) continue;
    const entry = map.get(keyOf(row));
    if (!entry) continue;
    entry.orders += row.orders;
    entry.totalCents += row.totalCents;
  }
  return [...map.values()];
}

/** Por status (todos, inclusive Cancelado), Fulfillment e meio (só não cancelados). */
export function reportBreakdowns(rows: readonly ReportOrderAggregateRow[]) {
  const notCancelled = (row: ReportOrderAggregateRow) => row.status !== "cancelled";
  return {
    byStatus: breakdown(
      ORDER_STATUSES,
      rows,
      (row) => row.status,
      () => true,
    ),
    byFulfillment: breakdown(FULFILLMENTS, rows, (row) => row.fulfillment, notCancelled),
    byPaymentMethod: breakdown(PAYMENT_METHODS, rows, (row) => row.paymentMethod, notCancelled),
  };
}

/** Top itens por quantidade (desempate: maior total, depois nome), com quebra Dom–Sáb. */
export function reportTopItems(
  rows: readonly ReportItemWeekdayRow[],
  limit = TOP_ITEMS_LIMIT,
): ReportTopItem[] {
  const items = new Map<
    string,
    { name: string; quantity: number; totalCents: number; byWeekday: WeekdayCounts }
  >();
  for (const row of rows) {
    assertCount(row.quantity, "quantity");
    assertCount(row.totalCents, "totalCents");
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) {
      throw new RangeError(`relatório: weekday inválido (${row.weekday})`);
    }
    let item = items.get(row.itemKey);
    if (!item) {
      item = { name: row.itemName, quantity: 0, totalCents: 0, byWeekday: [0, 0, 0, 0, 0, 0, 0] };
      items.set(row.itemKey, item);
    }
    if (row.itemName > item.name) item.name = row.itemName;
    item.quantity += row.quantity;
    item.totalCents += row.totalCents;
    item.byWeekday[row.weekday]! += row.quantity;
  }
  return [...items.values()]
    .sort(
      (a, b) =>
        b.quantity - a.quantity || b.totalCents - a.totalCents || a.name.localeCompare(b.name),
    )
    .slice(0, limit)
    .map((item, index) => ({ rank: index + 1, ...item }));
}

/** TOP 10 clientes (já ordenado/limitado no SQL): numera e garante só os três campos. */
export function reportTopCustomers(
  rows: readonly ReportCustomerRow[],
  limit = TOP_CUSTOMERS_LIMIT,
): ReportTopCustomer[] {
  return [...rows]
    .sort(
      (a, b) => b.totalCents - a.totalCents || b.orders - a.orders || a.name.localeCompare(b.name),
    )
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      orders: row.orders,
      totalCents: row.totalCents,
    }));
}

export type FinanceReportParts = {
  period: ResolvedReportPeriod;
  current: readonly ReportOrderAggregateRow[];
  previous: readonly ReportOrderAggregateRow[];
  items: readonly ReportItemWeekdayRow[];
  customers: readonly ReportCustomerRow[];
  funnel: FunnelReport;
};

export function buildFinanceReport(parts: FinanceReportParts): FinanceReport {
  const summary = reportSummary(parts.current);
  const previousSummary = reportSummary(parts.previous);
  return {
    period: parts.period,
    summary,
    previousSummary,
    comparison: reportComparison(summary, previousSummary),
    ...reportBreakdowns(parts.current),
    topItems: reportTopItems(parts.items),
    topCustomers: reportTopCustomers(parts.customers),
    funnel: parts.funnel,
    empty: summary.orders + summary.cancelled === 0,
  };
}
