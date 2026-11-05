import { Button, OutlineContainer } from "@foode/ui";
import type { OpsStoreListItem } from "@foode/shared/ops";
import Link from "next/link";

import { formatCents, formatPeriod } from "../../../lib/ops-format";
import { BILLING_CYCLE_LABEL, CARD_MODE_LABEL } from "../../../lib/ops-labels";
import { opsRead } from "../../../lib/ops-rpc";
import { requirePermission } from "../../../lib/session";
import { StoreStatusBadge } from "./_components/badges";
import { EmptyState } from "./_components/fields";
import { OpsPageHeader } from "./_components/page-header";

// Lista de Lojas (OPS-02): estado, Plano, faixa do mês e progresso do checklist. Só
// `foode_ops`; a api confere de novo (`opsListStores`).
export const dynamic = "force-dynamic";

function planCell(store: OpsStoreListItem) {
  if (!store.plan) return <span className="text-[var(--color-muted)]">Sem Plano</span>;
  return (
    <>
      <span className="font-bold text-[var(--color-ink)]">
        {store.plan.cycle === "annual" ? "Anual" : "Mensal"}
      </span>
      <span className="block text-xs text-[var(--color-muted)]">
        {formatPeriod(store.plan.validFrom, store.plan.validTo)}
      </span>
    </>
  );
}

function tierCell(store: OpsStoreListItem) {
  const month = store.monthTier;
  if (!month) return <span className="text-[var(--color-muted)]">—</span>;
  const orders = `${month.orderCount} Pedido${month.orderCount === 1 ? "" : "s"}`;
  if (!month.tier) {
    return (
      <>
        <span className="font-bold text-[var(--color-ink)]">{orders}</span>
        <span className="block text-xs text-[var(--color-muted)]">
          {store.plan?.cycle === "annual" ? "Ilimitados (anual)" : "Fora da tabela"}
        </span>
      </>
    );
  }
  const range =
    month.tier.maxOrders === null
      ? `${month.tier.minOrders}+`
      : `${month.tier.minOrders}–${month.tier.maxOrders}`;
  return (
    <>
      <span className="font-bold text-[var(--color-ink)]">{orders}</span>
      <span className="block text-xs text-[var(--color-muted)]">
        Faixa {range} · {formatCents(month.tier.priceCents)}
      </span>
    </>
  );
}

function checklistCell(store: OpsStoreListItem) {
  const done = store.onboarding.filter((item) => item.done).length;
  const total = store.onboarding.length;
  const complete = done === total;
  return (
    <span className={complete ? "font-bold text-[#1f5f23]" : "font-bold text-[var(--color-ink)]"}>
      {done} de {total}
    </span>
  );
}

export default async function OpsStoresPage() {
  await requirePermission("ops.area");
  const stores = await opsRead((api, caller) => api.opsListStores(caller));
  const counts = {
    active: stores.filter((s) => s.status === "active").length,
    onboarding: stores.filter((s) => s.status === "onboarding").length,
    suspended: stores.filter((s) => s.status === "suspended").length,
  };

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Lojas"
        description={
          stores.length === 0
            ? "Cadastre a primeira Loja, convide o Dono e defina o Plano para ativá-la."
            : `${stores.length} Loja${stores.length === 1 ? "" : "s"} · ${counts.active} ativa${counts.active === 1 ? "" : "s"} · ${counts.onboarding} em configuração · ${counts.suspended} suspensa${counts.suspended === 1 ? "" : "s"}`
        }
        actions={
          <Button asChild>
            <Link href="/ops/nova">Nova Loja</Link>
          </Button>
        }
      />

      <OutlineContainer className="mt-8 overflow-hidden">
        {stores.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nenhuma Loja cadastrada.">
              <p>
                Clique em <strong>Nova Loja</strong> para cadastrar a primeira. A Loja nasce em
                configuração e só aceita Pedidos depois de ativada.
              </p>
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse text-sm">
              <caption className="sr-only">Lojas cadastradas</caption>
              <thead>
                <tr className="border-b border-[var(--color-hairline)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  <th scope="col" className="px-5 py-3">
                    Loja
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Plano
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Faixa do mês
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Cartão
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Checklist
                  </th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr
                    key={store.id}
                    className="border-b border-[var(--color-hairline-soft)] last:border-b-0 hover:bg-[var(--color-primary-soft)]/40"
                  >
                    <th scope="row" className="px-5 py-4 text-left font-normal">
                      <Link
                        href={`/ops/lojas/${store.id}`}
                        className="font-bold text-[var(--color-ink)] underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {store.name}
                      </Link>
                      <span className="block text-xs text-[var(--color-muted)]">/{store.slug}</span>
                    </th>
                    <td className="px-4 py-4">
                      <StoreStatusBadge status={store.status} />
                    </td>
                    <td className="px-4 py-4">{planCell(store)}</td>
                    <td className="px-4 py-4">{tierCell(store)}</td>
                    <td className="px-4 py-4 text-[var(--color-body)]">
                      {store.cardMode ? CARD_MODE_LABEL[store.cardMode] : "—"}
                    </td>
                    <td className="px-4 py-4 text-right">{checklistCell(store)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutlineContainer>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Plano: {BILLING_CYCLE_LABEL.monthly.toLowerCase()} ou{" "}
        {BILLING_CYCLE_LABEL.annual.toLowerCase()}. Faixa do mês: Pedidos não cancelados do Canal
        próprio no mês civil (America/Sao_Paulo).
      </p>
    </section>
  );
}
