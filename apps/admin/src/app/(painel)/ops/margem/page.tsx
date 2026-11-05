import { OutlineContainer } from "@foode/ui";
import { type OpsMarginView, opsMarginInputSchema } from "@foode/shared/finance";

import { CivilRangeForm } from "../../../../components/civil-range-form";
import {
  defaultPastRange,
  formatCivilRange,
  formatCount,
  formatSignedCents,
  rangeFromSearchParams,
  saoPauloToday,
  type SearchParamsLike,
} from "../../../../lib/finance-labels";
import { formatCents } from "../../../../lib/ops-format";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { EmptyState } from "../_components/fields";
import { OpsPageHeader } from "../_components/page-header";

// `/ops/margem` (Ticket 14): margem por Loja e período = taxa Foode (líquida de Estornos) − custo do
// provedor − custo do envio. A tarifa de serviço é receita da Foode, mostrada à parte (decisão 71).
// Só `foode_ops`. Período pela URL (`?de=&ate=`).
export const dynamic = "force-dynamic";

const TH =
  "px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "px-4 py-3 text-[var(--color-ink)]";
const TD_NUM = `${TD} text-right tabular-nums`;

function MarginRow({
  label,
  row,
  strong = false,
}: {
  label: string;
  row: OpsMarginView["totals"];
  strong?: boolean;
}) {
  const weight = strong ? "font-bold" : "";
  return (
    <tr
      className={`border-b border-[var(--color-hairline-soft)] last:border-b-0 ${strong ? "bg-[var(--color-primary-soft)]/30" : ""}`}
    >
      <th scope="row" className={`${TD} text-left ${strong ? "font-bold" : "font-normal"}`}>
        {label}
      </th>
      <td className={`${TD_NUM} ${weight}`}>{formatCount(row.payments)}</td>
      <td className={`${TD_NUM} ${weight}`}>{formatCents(row.foodeFeeCents)}</td>
      <td className={`${TD_NUM} ${weight}`}>
        {formatCents(row.providerCostCents)}
        {row.providerCostUnknown > 0 ? (
          <span className="block text-xs font-normal text-[#7a5600]">
            {row.providerCostUnknown} sem custo conhecido
          </span>
        ) : null}
      </td>
      <td className={`${TD_NUM} ${weight}`}>
        {formatCents(row.transferCostCents)}
        <span className="block text-xs font-normal text-[var(--color-muted)]">
          {formatCount(row.batches)} {row.batches === 1 ? "lote" : "lotes"}
        </span>
      </td>
      <td
        className={`${TD_NUM} font-bold ${row.marginCents < 0 ? "text-[var(--color-error)]" : ""}`}
      >
        {formatSignedCents(row.marginCents, formatCents)}
      </td>
      <td className={`${TD_NUM} ${weight}`}>{formatCents(row.serviceFeeCents)}</td>
    </tr>
  );
}

export default async function OpsMarginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsLike>;
}) {
  await requirePermission("ops.area");
  const today = saoPauloToday();
  const range = rangeFromSearchParams((await searchParams) ?? {}, defaultPastRange(today));
  const input = opsMarginInputSchema.safeParse(range);
  const view = input.success
    ? await opsRead((api, caller) => api.opsMarginReport(caller, input.data))
    : null;

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <OpsPageHeader
        title="Margem"
        description="Por Loja e período: taxa Foode (líquida de Estornos) − custo do provedor − custo do envio dos lotes. A tarifa de serviço do Consumidor é receita à parte e não entra na margem."
      />

      <CivilRangeForm action="/ops/margem" from={range.from} to={range.to} />

      {!view ? (
        <OutlineContainer className="p-6" role="alert">
          <p className="font-bold text-[var(--color-ink)]">Período inválido.</p>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            Até 92 dias, com o início antes do fim.
          </p>
        </OutlineContainer>
      ) : (
        <>
          <section
            aria-label="Totais do período"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <OutlineContainer className="p-5">
              <p className="text-sm font-bold text-[var(--color-muted)]">Margem</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${view.totals.marginCents < 0 ? "text-[var(--color-error)]" : "text-[var(--color-ink)]"}`}
              >
                {formatSignedCents(view.totals.marginCents, formatCents)}
              </p>
            </OutlineContainer>
            <OutlineContainer className="p-5">
              <p className="text-sm font-bold text-[var(--color-muted)]">Taxa Foode</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {formatCents(view.totals.foodeFeeCents)}
              </p>
            </OutlineContainer>
            <OutlineContainer className="p-5">
              <p className="text-sm font-bold text-[var(--color-muted)]">
                Custos (provedor + envio)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {formatCents(view.totals.providerCostCents + view.totals.transferCostCents)}
              </p>
            </OutlineContainer>
            <OutlineContainer className="p-5">
              <p className="text-sm font-bold text-[var(--color-muted)]">
                Tarifa de serviço (à parte)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {formatCents(view.totals.serviceFeeCents)}
              </p>
            </OutlineContainer>
          </section>

          <OutlineContainer as="section" aria-label="Margem por Loja" className="overflow-hidden">
            {view.stores.length === 0 ? (
              <div className="p-6">
                <EmptyState title="Nenhum pagamento online no período.">
                  {formatCivilRange(view.from, view.to)}: sem pagamentos confirmados em nenhuma
                  Loja.
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <caption className="sr-only">
                    Margem por Loja entre {formatCivilRange(view.from, view.to)}
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--color-hairline)]">
                      <th scope="col" className={TH}>
                        Loja
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Pagamentos
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Taxa Foode
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Custo do provedor
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Custo do envio
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Margem
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Tarifa de serviço
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.stores.map((store) => (
                      <MarginRow key={store.storeId} label={store.storeName} row={store} />
                    ))}
                    <MarginRow label="Total" row={view.totals} strong />
                  </tbody>
                </table>
              </div>
            )}
          </OutlineContainer>
          <p className="text-xs text-[var(--color-muted)]">
            "Sem custo conhecido": pagamentos sem tabela de custo do provedor vigente na data; a
            margem fica otimista até o custo ser cadastrado em Custos dos provedores.
          </p>
        </>
      )}
    </section>
  );
}
