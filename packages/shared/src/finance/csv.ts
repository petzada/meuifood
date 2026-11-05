// Exportação CSV dos agregados do relatório (Ticket 14; decisão 64: CSV + impressão do navegador,
// sem PDF/XLSX no servidor). Compatível com o Excel pt-BR: UTF-8 com BOM, separador `;`, decimal
// com vírgula, CRLF. Só agregados: NENHUMA coluna de dado pessoal (telefone, CPF, endereço, nome de
// cliente) — o TOP 10 clientes não é exportado (decisão 64).
import type { FunnelEvent } from "../onboarding/funnel.js";
import type { Fulfillment, OrderStatus, PaymentMethod } from "../order/status.js";
import type { FinanceReport } from "./report.js";

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";
export const CSV_EOL = "\r\n";
export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

/** Resposta de `reportsExportCsv`: o admin devolve como download (`Content-Disposition`). */
export type ReportCsvExport = { filename: string; contentType: string; csv: string };

/** Cabeçalhos que NUNCA podem aparecer no CSV (conferido nos testes). */
export const CSV_FORBIDDEN_HEADERS = [
  "telefone",
  "cpf",
  "endereço",
  "endereco",
  "cliente",
  "e-mail",
  "email",
] as const;

/** Centavos → "1234,56" (sem separador de milhar, vírgula decimal, sinal "-"). */
export function csvCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`centavos inválidos: ${cents}`);
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${reais},${fraction}`;
}

/** Basis points → "12,34" (percentual com vírgula); null → vazio. */
export function csvPercentBps(bps: number | null): string {
  if (bps === null) return "";
  return csvCents(bps);
}

/**
 * Campo CSV: aspas quando há separador, aspas, quebra de linha ou espaço nas pontas; prefixo `'`
 * em texto que começa com `=`, `+`, `-`, `@` (injeção de fórmula no Excel). Números passam como
 * texto já formatado (as funções acima).
 */
export function csvField(value: string | number): string {
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/u.test(text) && !/^-?\d+(,\d+)?$/u.test(text)) {
    text = `'${text}`;
  }
  if (/[";\r\n]/u.test(text) || text !== text.trim()) return `"${text.replace(/"/gu, '""')}"`;
  return text;
}

/** Documento CSV completo (BOM + linhas com CRLF). */
export function buildCsv(rows: readonly (readonly (string | number)[])[]): string {
  return CSV_BOM + rows.map((row) => row.map(csvField).join(CSV_SEPARATOR)).join(CSV_EOL) + CSV_EOL;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const FULFILLMENT_LABEL: Record<Fulfillment, string> = { delivery: "Delivery", pickup: "Retirada" };

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  credit: "Cartão de crédito",
  on_delivery: "Pagamento na entrega",
};

const FUNNEL_LABEL: Record<FunnelEvent, string> = {
  visit: "Visitas",
  item_view: "Viu item",
  add_to_cart: "Adicionou ao carrinho",
  checkout_start: "Iniciou checkout",
  order: "Pedidos",
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Nome do arquivo: `relatorio-<slug>-<de>-a-<ate>.csv` (só ASCII). */
export function reportCsvFilename(
  storeSlug: string,
  report: Pick<FinanceReport, "period">,
): string {
  const slug = storeSlug.toLowerCase().replace(/[^a-z0-9-]/gu, "") || "loja";
  return `relatorio-${slug}-${report.period.from}-a-${report.period.to}.csv`;
}

/**
 * CSV dos agregados do período: resumo com comparativo, por status/Fulfillment/meio, top itens
 * com dia da semana e funil. Sem TOP 10 clientes e sem nenhum dado pessoal.
 */
export function reportCsv(report: FinanceReport): string {
  const { period, summary, previousSummary, comparison } = report;
  const rows: (string | number)[][] = [
    ["Relatório", "De", "Até", "Comparado com", "De (anterior)", "Até (anterior)"],
    [
      "Período",
      period.from,
      period.to,
      period.comparisonLabel,
      period.previous.from,
      period.previous.to,
    ],
    [],
    ["Indicador", "Período", "Período anterior", "Variação (%)"],
    ["Pedidos", summary.orders, previousSummary.orders, csvPercentBps(comparison.orders.changeBps)],
    [
      "Cancelados",
      summary.cancelled,
      previousSummary.cancelled,
      csvPercentBps(comparison.cancelled.changeBps),
    ],
    [
      "Total vendido (R$)",
      csvCents(summary.totalSoldCents),
      csvCents(previousSummary.totalSoldCents),
      csvPercentBps(comparison.totalSoldCents.changeBps),
    ],
    [
      "Ticket médio (R$)",
      csvCents(summary.averageTicketCents),
      csvCents(previousSummary.averageTicketCents),
      csvPercentBps(comparison.averageTicketCents.changeBps),
    ],
    ["GMV (R$)", csvCents(summary.gmvCents), csvCents(previousSummary.gmvCents), ""],
    [],
    ["Status", "Pedidos", "Total (R$)"],
    ...report.byStatus.map((row) => [STATUS_LABEL[row.key], row.orders, csvCents(row.totalCents)]),
    [],
    ["Fulfillment", "Pedidos", "Total (R$)"],
    ...report.byFulfillment.map((row) => [
      FULFILLMENT_LABEL[row.key],
      row.orders,
      csvCents(row.totalCents),
    ]),
    [],
    ["Meio de pagamento", "Pedidos", "Total (R$)"],
    ...report.byPaymentMethod.map((row) => [
      METHOD_LABEL[row.key],
      row.orders,
      csvCents(row.totalCents),
    ]),
    [],
    ["Posição", "Item", "Quantidade", "Total (R$)", ...WEEKDAYS],
    ...report.topItems.map((item) => [
      item.rank,
      item.name,
      item.quantity,
      csvCents(item.totalCents),
      ...item.byWeekday,
    ]),
    [],
    ["Funil", "Total", "Conversão do passo (%)"],
    ...(Object.keys(FUNNEL_LABEL) as FunnelEvent[]).map((event) => [
      FUNNEL_LABEL[event],
      report.funnel.totals[event],
      event === "visit" ? "" : csvPercentBps(report.funnel.stepConversionBps[event]),
    ]),
  ];
  return buildCsv(rows);
}
