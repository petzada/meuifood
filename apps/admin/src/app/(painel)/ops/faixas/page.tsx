import { OutlineContainer } from "@foode/ui";
import { PLAN_TIERS_SEED, type PlanTierTableView } from "@foode/shared/ops";

import { formatCents, formatPeriod } from "../../../../lib/ops-format";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { PeriodBadge } from "../_components/badges";
import { EmptyState, SectionHeading } from "../_components/fields";
import { OpsPageHeader } from "../_components/page-header";
import { TiersForm } from "../_components/tiers-form";
import { publishPlanTiers } from "../actions";

// Tabela de faixas por Pedidos (decisão 61): vigente, futuras e histórico; publicar nova.
export const dynamic = "force-dynamic";

function TierTable({ table }: { table: PlanTierTableView }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodBadge validFrom={table.validFrom} validTo={table.validTo} />
        <p className="text-sm text-[var(--color-body)]">
          {formatPeriod(table.validFrom, table.validTo)}
        </p>
      </div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Faixas mensais com vigência {formatPeriod(table.validFrom, table.validTo)}
        </caption>
        <thead>
          <tr className="border-b border-[var(--color-hairline)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            <th scope="col" className="py-2 pr-4">
              Pedidos no mês
            </th>
            <th scope="col" className="px-4 py-2 text-right">
              Mensalidade
            </th>
          </tr>
        </thead>
        <tbody>
          {table.monthlyTiers.map((tier) => (
            <tr key={tier.id} className="border-b border-[var(--color-hairline-soft)]">
              <td className="py-2.5 pr-4 text-[var(--color-ink)]">
                {tier.maxOrders === null
                  ? `${tier.minOrders} ou mais`
                  : `${tier.minOrders} a ${tier.maxOrders}`}
              </td>
              <td className="px-4 py-2.5 text-right font-bold text-[var(--color-ink)]">
                {formatCents(tier.priceCents)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2.5 pr-4 text-[var(--color-ink)]">Anual · Pedidos ilimitados</td>
            <td className="px-4 py-2.5 text-right font-bold text-[var(--color-ink)]">
              {table.annual ? `${formatCents(table.annual.priceCents)} / ano` : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function PlanTiersPage() {
  await requirePermission("ops.area");
  const tables = await opsRead((api, caller) => api.opsListPlanTiers(caller));
  const now = new Date().toISOString();
  const current =
    tables.find((t) => t.validFrom <= now && (t.validTo === null || t.validTo > now)) ?? null;
  const future = tables.filter((t) => t.validFrom > now);
  const past = tables.filter((t) => t.validTo !== null && t.validTo <= now);
  const base = current ?? tables[0] ?? null;

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Faixas do Plano"
        description="Mensalidade por quantidade de Pedidos não cancelados do Canal próprio no mês civil. Publicar uma tabela nova encerra a vigente no instante escolhido; o histórico fica."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <OutlineContainer className="p-6">
            <SectionHeading id="vigente">Tabela vigente</SectionHeading>
            <div className="mt-4">
              {current ? (
                <TierTable table={current} />
              ) : (
                <EmptyState title="Nenhuma tabela vigente.">
                  <p>Publique uma tabela ao lado; até lá a faixa do mês não é calculada.</p>
                </EmptyState>
              )}
            </div>
          </OutlineContainer>
          {future.length > 0 ? (
            <OutlineContainer className="p-6">
              <SectionHeading id="futuras">Tabelas futuras</SectionHeading>
              <div className="mt-4 space-y-6">
                {future.map((table) => (
                  <TierTable key={table.validFrom} table={table} />
                ))}
              </div>
            </OutlineContainer>
          ) : null}
          {past.length > 0 ? (
            <OutlineContainer className="p-6">
              <details>
                <summary className="cursor-pointer text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
                  Histórico ({past.length})
                </summary>
                <div className="mt-4 space-y-6">
                  {past.map((table) => (
                    <TierTable key={table.validFrom} table={table} />
                  ))}
                </div>
              </details>
            </OutlineContainer>
          ) : null}
        </div>

        <OutlineContainer className="p-6 md:p-8">
          <SectionHeading
            id="publicar"
            description="Começa na tabela vigente. Faixas contíguas a partir de 0; só a última sem teto."
          >
            Publicar nova tabela
          </SectionHeading>
          <div className="mt-5">
            <TiersForm
              action={publishPlanTiers}
              initialAnnualCents={base?.annual?.priceCents ?? PLAN_TIERS_SEED.annualPriceCents}
              initialTiers={base?.monthlyTiers ?? PLAN_TIERS_SEED.monthlyTiers}
            />
          </div>
        </OutlineContainer>
      </div>
    </section>
  );
}
