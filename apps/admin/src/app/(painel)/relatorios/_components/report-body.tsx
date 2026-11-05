// Corpo do relatório (presentacional, server-safe): números do topo com comparativo em seta +
// texto (P-REL-5; nunca só cor), GMV e tarifa de serviço separadas (decisão 71), quebras por
// status/Fulfillment/meio, Top 10 itens com Dom–Sáb (P-REL-2), TOP 10 clientes só com nome,
// quantidade e total (P-REL-3, decisão 64: sem exportação) e o funil próprio (P-REL-4).
import { OutlineContainer } from "@foode/ui";
import { comparisonText, type FinanceReport, type MetricComparison } from "@foode/shared/finance";
import type { ReactNode } from "react";

import {
  formatBpsPercent,
  formatCivilRange,
  formatCount,
  FUNNEL_STEP_LABEL,
  FUNNEL_STEPS,
  GMV_DEFINITION,
  REPORT_FULFILLMENT_LABEL,
  REPORT_METHOD_LABEL,
  REPORT_STATUS_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
} from "../../../../lib/finance-labels";
import { formatCents } from "../../../../lib/ops-format";
import { SectionHeading } from "../../ops/_components/fields";

const TH =
  "px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "px-4 py-3 text-[var(--color-ink)]";
const TD_NUM = `${TD} text-right tabular-nums`;

function Comparison({ comparison, label }: { comparison: MetricComparison; label: string }) {
  const { arrow, text } = comparisonText(comparison, label);
  const tone =
    comparison.direction === "up"
      ? "text-[#1f5f23]"
      : comparison.direction === "down"
        ? "text-[var(--color-error)]"
        : "text-[var(--color-muted)]";
  return (
    <p className={`mt-1 text-sm font-bold ${tone}`}>
      <span aria-hidden="true">{arrow} </span>
      <span className="sr-only">
        {comparison.direction === "up"
          ? "Subiu: "
          : comparison.direction === "down"
            ? "Caiu: "
            : "Estável: "}
      </span>
      {text}
    </p>
  );
}

function Metric({
  children,
  comparison,
  label,
  note,
  value,
}: {
  children?: ReactNode;
  comparison?: { comparison: MetricComparison; label: string };
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <OutlineContainer className="foode-print-break p-5">
      <p className="text-sm font-bold text-[var(--color-muted)]">
        {label}
        {note ? (
          <>
            {" "}
            <abbr title={note} className="cursor-help no-underline">
              (?)
            </abbr>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">{value}</p>
      {comparison ? <Comparison {...comparison} /> : null}
      {note ? <p className="mt-1 text-xs text-[var(--color-muted)]">{note}</p> : null}
      {children}
    </OutlineContainer>
  );
}

function BreakdownTable<K extends string>({
  caption,
  id,
  labelOf,
  rows,
  subject,
}: {
  caption: string;
  id: string;
  labelOf: (key: K) => string;
  rows: { key: K; orders: number; totalCents: number }[];
  subject: string;
}) {
  return (
    <OutlineContainer
      as="section"
      aria-labelledby={id}
      className="foode-print-break overflow-hidden"
    >
      <div className="p-5 pb-3">
        <SectionHeading id={id}>{caption}</SectionHeading>
      </div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Pedidos e total por {subject}</caption>
        <thead>
          <tr className="border-y border-[var(--color-hairline-soft)]">
            <th scope="col" className={TH}>
              {subject}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Pedidos
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
            >
              <th scope="row" className={`${TD} text-left font-normal`}>
                {labelOf(row.key)}
              </th>
              <td className={TD_NUM}>{formatCount(row.orders)}</td>
              <td className={TD_NUM}>{formatCents(row.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </OutlineContainer>
  );
}

export function ReportBody({ report, storeName }: { report: FinanceReport; storeName: string }) {
  const { summary, comparison, period } = report;
  const label = period.comparisonLabel;
  const previousRange = formatCivilRange(period.previous.from, period.previous.to);

  return (
    <div className="space-y-8">
      <p className="hidden print:block text-sm text-[var(--color-muted)]">
        {storeName} · Relatório de {formatCivilRange(period.from, period.to)} · comparado com{" "}
        {previousRange}
      </p>

      <section aria-label="Resumo do período" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Pedidos"
          value={formatCount(summary.orders)}
          comparison={{ comparison: comparison.orders, label }}
        />
        <Metric
          label="Cancelados"
          value={formatCount(summary.cancelled)}
          comparison={{ comparison: comparison.cancelled, label }}
        />
        <Metric
          label="Total vendido"
          value={formatCents(summary.totalSoldCents)}
          comparison={{ comparison: comparison.totalSoldCents, label }}
        />
        <Metric
          label="Ticket médio"
          value={formatCents(summary.averageTicketCents)}
          comparison={{ comparison: comparison.averageTicketCents, label }}
        />
      </section>

      <section aria-label="Métricas complementares" className="grid gap-4 sm:grid-cols-2">
        <Metric label="GMV" value={formatCents(summary.gmvCents)} note={GMV_DEFINITION} />
        <OutlineContainer className="foode-print-break p-5">
          <p className="text-sm font-bold text-[var(--color-muted)]">Tarifa de serviço</p>
          <p className="mt-1 text-base text-[var(--color-body)]">
            A tarifa de serviço que o Consumidor paga no pagamento online é receita da Foode e{" "}
            <strong>não entra</strong> no Total vendido, no Ticket médio nem no repasse.
          </p>
        </OutlineContainer>
      </section>

      <p className="text-sm text-[var(--color-muted)]">
        Comparativo com o período anterior de mesma duração ({previousRange}): Pedidos{" "}
        {formatCount(report.previousSummary.orders)}, Total vendido{" "}
        {formatCents(report.previousSummary.totalSoldCents)}. Pedidos contados: pagos ou com
        pagamento na entrega, criados no período (dias de Brasília); Total vendido exclui os
        cancelados.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownTable
          caption="Por status"
          id="rel-status"
          labelOf={(key) => REPORT_STATUS_LABEL[key]}
          rows={report.byStatus}
          subject="Status"
        />
        <BreakdownTable
          caption="Por Fulfillment"
          id="rel-fulfillment"
          labelOf={(key) => REPORT_FULFILLMENT_LABEL[key]}
          rows={report.byFulfillment}
          subject="Fulfillment"
        />
        <BreakdownTable
          caption="Por meio de pagamento"
          id="rel-meio"
          labelOf={(key) => REPORT_METHOD_LABEL[key]}
          rows={report.byPaymentMethod}
          subject="Meio de pagamento"
        />
      </div>

      <OutlineContainer
        as="section"
        aria-labelledby="rel-itens"
        className="foode-print-break overflow-hidden"
      >
        <div className="p-5 pb-3">
          <SectionHeading
            id="rel-itens"
            description="Itens mais vendidos por quantidade no período, com a quantidade em cada dia da semana."
          >
            Top 10 itens
          </SectionHeading>
        </div>
        {report.topItems.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--color-body)]">
            Nenhum item vendido no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">
                Top 10 itens por quantidade, com a quebra por dia da semana (domingo a sábado)
              </caption>
              <thead>
                <tr className="border-y border-[var(--color-hairline-soft)]">
                  <th scope="col" className={`${TH} text-right`}>
                    #
                  </th>
                  <th scope="col" className={TH}>
                    Item
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Qtd.
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Total
                  </th>
                  {WEEKDAY_SHORT.map((day, index) => (
                    <th key={day} scope="col" className={`${TH} text-right`}>
                      <abbr title={WEEKDAY_LONG[index]} className="no-underline">
                        {day}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.topItems.map((item) => (
                  <tr
                    key={item.rank}
                    className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                  >
                    <td className={TD_NUM}>{item.rank}</td>
                    <th scope="row" className={`${TD} text-left font-bold`}>
                      {item.name}
                    </th>
                    <td className={TD_NUM}>{formatCount(item.quantity)}</td>
                    <td className={TD_NUM}>{formatCents(item.totalCents)}</td>
                    {item.byWeekday.map((count, index) => (
                      <td key={WEEKDAY_SHORT[index]} className={TD_NUM}>
                        {formatCount(count)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutlineContainer>

      <OutlineContainer
        as="section"
        aria-labelledby="rel-clientes"
        className="foode-print-break overflow-hidden"
      >
        <div className="p-5 pb-3">
          <SectionHeading
            id="rel-clientes"
            description="Consumidores com conta na Foode que mais compraram na sua Loja no período. Só nome, Pedidos e total; não sai no CSV."
          >
            TOP 10 clientes
          </SectionHeading>
        </div>
        {report.topCustomers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--color-body)]">
            Nenhum Pedido de Consumidor com conta no período.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">TOP 10 clientes por valor</caption>
            <thead>
              <tr className="border-y border-[var(--color-hairline-soft)]">
                <th scope="col" className={`${TH} text-right`}>
                  #
                </th>
                <th scope="col" className={TH}>
                  Cliente
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Pedidos
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {report.topCustomers.map((customer) => (
                <tr
                  key={customer.rank}
                  className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                >
                  <td className={TD_NUM}>{customer.rank}</td>
                  <th scope="row" className={`${TD} text-left font-bold`}>
                    {customer.name}
                  </th>
                  <td className={TD_NUM}>{formatCount(customer.orders)}</td>
                  <td className={TD_NUM}>{formatCents(customer.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </OutlineContainer>

      <OutlineContainer
        as="section"
        aria-labelledby="rel-funil"
        className="foode-print-break overflow-hidden"
      >
        <div className="p-5 pb-3">
          <SectionHeading
            id="rel-funil"
            description="Funil do seu Storefront no período, contado pela Foode (sem dado pessoal). Conversão de cada passo sobre o anterior."
          >
            Funil de conversão
          </SectionHeading>
        </div>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Funil de conversão do Storefront</caption>
          <thead>
            <tr className="border-y border-[var(--color-hairline-soft)]">
              <th scope="col" className={TH}>
                Passo
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Total
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Conversão do passo
              </th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_STEPS.map((step) => (
              <tr
                key={step}
                className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
              >
                <th scope="row" className={`${TD} text-left font-normal`}>
                  {FUNNEL_STEP_LABEL[step]}
                </th>
                <td className={TD_NUM}>{formatCount(report.funnel.totals[step])}</td>
                <td className={TD_NUM}>
                  {step === "visit" ? "—" : formatBpsPercent(report.funnel.stepConversionBps[step])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </OutlineContainer>
    </div>
  );
}
