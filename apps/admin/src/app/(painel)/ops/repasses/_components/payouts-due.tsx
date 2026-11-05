"use client";

// "A repassar hoje" (OPS-04): uma ficha por Loja com o valor do Pix, chave e titular, débitos de
// Estorno compensados e ajustes, e os itens do lote. "Marcar lote pago" abre o modal; Loja sem
// conta de repasse ou lote não positivo não tem o botão (o motivo fica escrito, T-03/T-04).
import { Button, OutlineContainer } from "@foode/ui";
import type { OpsPayoutsDueView, OpsPayoutDueStoreView } from "@foode/shared/finance";
import { useState } from "react";

import {
  formatCivilDate,
  formatSignedCents,
  PAYOUT_ITEM_KIND_LABEL,
  PAYOUT_METHOD_LABEL,
} from "../../../../../lib/finance-labels";
import { formatCents } from "../../../../../lib/ops-format";
import { PIX_KEY_TYPE_LABEL } from "../../../../../lib/ops-labels";
import { EmptyState } from "../../_components/fields";
import { type MarkPaidAction, MarkPaidModal } from "./mark-paid-modal";

const TH =
  "px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "px-4 py-2 text-[var(--color-ink)]";

function StoreCard({
  onMarkPaid,
  store,
}: {
  onMarkPaid: (store: OpsPayoutDueStoreView) => void;
  store: OpsPayoutDueStoreView;
}) {
  const [open, setOpen] = useState(false);
  const itemsId = `itens-${store.storeId}`;
  return (
    <OutlineContainer as="article" aria-labelledby={`loja-${store.storeId}`} className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 id={`loja-${store.storeId}`} className="text-lg font-bold text-[var(--color-ink)]">
            {store.storeName}
            <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
              /{store.storeSlug}
            </span>
          </h3>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
            {formatCents(store.amountCents)}
          </p>
          <p className="text-sm text-[var(--color-body)]">
            {store.itemCount} {store.itemCount === 1 ? "item" : "itens"} · lançamentos{" "}
            {formatCents(store.entriesCents)}
            {store.debitsCents
              ? ` · débitos de Estorno compensados − ${formatCents(store.debitsCents)}`
              : ""}
            {store.adjustmentsCents
              ? ` · ajustes ${formatSignedCents(store.adjustmentsCents, formatCents)}`
              : ""}
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Chave Pix
              </dt>
              <dd className="break-all text-[var(--color-ink)]">
                {store.payout
                  ? `${PIX_KEY_TYPE_LABEL[store.payout.pixKeyType]}: ${store.payout.pixKey}`
                  : "Sem conta de repasse cadastrada"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                Titular
              </dt>
              <dd className="text-[var(--color-ink)]">{store.payout?.holderName ?? "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
          {store.payable ? (
            <Button onClick={() => onMarkPaid(store)}>Marcar lote pago</Button>
          ) : (
            <p className="max-w-[28ch] text-sm font-bold text-[var(--color-error)]" role="note">
              {store.payout
                ? "Lote não pagável: os débitos superam os lançamentos e seguem para os próximos dias."
                : "Sem conta de repasse: cadastre a chave Pix da Loja antes de pagar."}
            </p>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={itemsId}
            onClick={() => setOpen((value) => !value)}
            className="min-h-11 rounded-full px-4 text-sm font-bold text-[var(--color-body)] underline-offset-4 hover:underline"
          >
            {open ? "Esconder itens" : "Ver itens"}
          </button>
        </div>
      </div>
      {open ? (
        <div id={itemsId} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">Itens do lote de {store.storeName}</caption>
            <thead>
              <tr className="border-y border-[var(--color-hairline-soft)]">
                <th scope="col" className={TH}>
                  Item
                </th>
                <th scope="col" className={TH}>
                  Pedido
                </th>
                <th scope="col" className={TH}>
                  Meio
                </th>
                <th scope="col" className={TH}>
                  Previsto
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {store.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                >
                  <td className={TD}>
                    {PAYOUT_ITEM_KIND_LABEL[item.kind]}
                    {item.reason ? (
                      <span className="block text-xs text-[var(--color-muted)]">{item.reason}</span>
                    ) : null}
                  </td>
                  <td className={TD}>{item.orderCode === null ? "—" : `#${item.orderCode}`}</td>
                  <td className={TD}>{item.method ? PAYOUT_METHOD_LABEL[item.method] : "—"}</td>
                  <td className={TD}>
                    {item.expectedPayoutDate
                      ? formatCivilDate(item.expectedPayoutDate)
                      : "Próximo lote"}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {formatSignedCents(item.amountCents, formatCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </OutlineContainer>
  );
}

export function PayoutsDue({ action, view }: { action: MarkPaidAction; view: OpsPayoutsDueView }) {
  const [marking, setMarking] = useState<OpsPayoutDueStoreView | null>(null);
  const total = view.stores.reduce(
    (sum, store) => sum + (store.payable ? store.amountCents : 0),
    0,
  );

  return (
    <section aria-labelledby="ops-hoje" className="space-y-4">
      <div>
        <h2 id="ops-hoje" className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
          A repassar hoje
        </h2>
        <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-[var(--color-body)]">
          Itens com repasse previsto até {formatCivilDate(view.asOf)}
          {view.isBusinessDay
            ? ""
            : " (hoje não é dia útil: a lista é informativa, o Pix sai no próximo dia útil)"}
          . Total pagável: <strong>{formatCents(total)}</strong> em{" "}
          {view.stores.filter((store) => store.payable).length} Loja(s).
        </p>
      </div>

      {view.stores.length === 0 ? (
        <EmptyState title="Nada a repassar hoje.">
          Pagamentos online confirmados entram aqui no dia do repasse previsto (D+1 útil no PIX).
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {view.stores.map((store) => (
            <StoreCard key={store.storeId} store={store} onMarkPaid={setMarking} />
          ))}
        </div>
      )}

      {marking ? (
        <MarkPaidModal
          action={action}
          asOf={view.asOf}
          onClose={() => setMarking(null)}
          store={marking}
        />
      ) : null}
    </section>
  );
}
