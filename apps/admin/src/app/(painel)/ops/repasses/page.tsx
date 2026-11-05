import { OutlineContainer } from "@foode/ui";
import { type OpsPayoutBatchView, opsPayoutBatchesInputSchema } from "@foode/shared/finance";

import { CivilRangeForm } from "../../../../components/civil-range-form";
import { SourceAccountBadge } from "../../../../components/payout-badges";
import {
  defaultPastRange,
  formatCivilDate,
  formatCivilRange,
  formatSignedCents,
  rangeFromSearchParams,
  saoPauloToday,
  type SearchParamsLike,
} from "../../../../lib/finance-labels";
import { formatCents, formatDateTimeSp } from "../../../../lib/ops-format";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { EmptyState, SectionHeading } from "../_components/fields";
import { OpsPageHeader } from "../_components/page-header";
import { createPayoutAdjustment, markPayoutPaid } from "./actions";
import { AdjustmentButton } from "./_components/adjustment-form";
import { PayoutsDue } from "./_components/payouts-due";

// `/ops/repasses` (Ticket 14; OPS-01/OPS-04): "A repassar hoje" por Loja com "Marcar lote pago",
// lotes pagos de uma Loja no período (`?loja=&de=&ate=`) e o ajuste auditado. Só `foode_ops`.
export const dynamic = "force-dynamic";

const TH =
  "px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "px-4 py-3 text-[var(--color-ink)]";
const TD_NUM = `${TD} text-right tabular-nums`;

export default async function OpsPayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsLike>;
}) {
  await requirePermission("ops.area");
  const params = (await searchParams) ?? {};
  const today = saoPauloToday();
  const range = rangeFromSearchParams(params, defaultPastRange(today));
  const [due, stores] = await Promise.all([
    opsRead((api, caller) => api.opsPayoutsDue(caller)),
    opsRead((api, caller) => api.opsListStores(caller)),
  ]);
  const storeOptions = stores.map((store) => ({ id: store.id, name: store.name }));
  const lojaParam = typeof params.loja === "string" ? params.loja : null;
  const selectedStore =
    storeOptions.find((store) => store.id === lojaParam) ?? storeOptions[0] ?? null;

  let batches: OpsPayoutBatchView[] = [];
  let batchesInvalid = false;
  if (selectedStore) {
    const input = opsPayoutBatchesInputSchema.safeParse({ storeId: selectedStore.id, ...range });
    if (input.success) {
      batches = await opsRead((api, caller) => api.opsPayoutBatches(caller, input.data));
    } else {
      batchesInvalid = true;
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-10">
      <OpsPageHeader
        title="Repasses"
        description="Pix diário por Loja (D+1 útil): confira o lote, pague pela conta de saída e marque como pago. Lote pago é imutável; correção só por ajuste."
        actions={
          <AdjustmentButton
            action={createPayoutAdjustment}
            batches={batches.map((batch) => ({
              id: batch.id,
              storeId: batch.storeId,
              label: `${formatCivilDate(batch.paidOn)} · ${formatCents(batch.amountCents)} · ${batch.reference}`,
            }))}
            stores={storeOptions}
          />
        }
      />

      <PayoutsDue action={markPayoutPaid} view={due} />

      <OutlineContainer as="section" aria-labelledby="ops-lotes" className="overflow-hidden">
        <div className="space-y-4 p-5 md:px-7 md:pt-7">
          <SectionHeading
            id="ops-lotes"
            description={
              selectedStore
                ? `Lotes de ${selectedStore.name} com Pix entre ${formatCivilRange(range.from, range.to)}.`
                : "Cadastre uma Loja para ver os lotes."
            }
          >
            Lotes pagos
          </SectionHeading>
          {selectedStore ? (
            <CivilRangeForm action="/ops/repasses" from={range.from} to={range.to}>
              <label className="text-sm font-bold text-[var(--color-ink)]">
                Loja
                <select
                  name="loja"
                  defaultValue={selectedStore.id}
                  className="mt-1 block min-h-11 rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base font-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
                >
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            </CivilRangeForm>
          ) : null}
        </div>
        {batchesInvalid ? (
          <p role="alert" className="px-5 pb-5 text-sm font-bold text-[var(--color-error)]">
            Período inválido: até 92 dias, com o início antes do fim.
          </p>
        ) : batches.length === 0 ? (
          <div className="px-5 pb-5 md:px-7 md:pb-7">
            <EmptyState title="Nenhum lote pago neste período." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <caption className="sr-only">Lotes pagos de {selectedStore?.name}</caption>
              <thead>
                <tr className="border-y border-[var(--color-hairline-soft)]">
                  <th scope="col" className={TH}>
                    Lote do dia
                  </th>
                  <th scope="col" className={TH}>
                    Pix em
                  </th>
                  <th scope="col" className={TH}>
                    Conta
                  </th>
                  <th scope="col" className={TH}>
                    Identificador
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Lançamentos
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Débitos
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Ajustes
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Valor do Pix
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Custo do envio
                  </th>
                  <th scope="col" className={TH}>
                    Marcado em
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                  >
                    <th scope="row" className={`${TD} text-left font-bold`}>
                      {formatCivilDate(batch.payoutDate)}
                    </th>
                    <td className={TD}>{formatCivilDate(batch.paidOn)}</td>
                    <td className={TD}>
                      <SourceAccountBadge account={batch.sourceAccount} />
                    </td>
                    <td className={`${TD} break-all`}>{batch.reference}</td>
                    <td className={TD_NUM}>{formatCents(batch.entriesCents)}</td>
                    <td className={TD_NUM}>
                      {batch.debitsCents ? `− ${formatCents(batch.debitsCents)}` : "—"}
                    </td>
                    <td className={TD_NUM}>
                      {batch.adjustmentsCents
                        ? formatSignedCents(batch.adjustmentsCents, formatCents)
                        : "—"}
                    </td>
                    <td className={`${TD_NUM} font-bold`}>{formatCents(batch.amountCents)}</td>
                    <td className={TD_NUM}>{formatCents(batch.transferCostCents)}</td>
                    <td className={TD}>
                      {formatDateTimeSp(batch.createdAt)}
                      <span className="block text-xs text-[var(--color-muted)]">
                        {batch.itemCount} itens
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutlineContainer>
    </section>
  );
}
