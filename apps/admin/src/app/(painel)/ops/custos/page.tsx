import { OutlineContainer } from "@foode/ui";

import { PROVIDER_LABEL, PROVIDER_OPERATION_LABEL } from "../../../../lib/ops-labels";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { SectionHeading } from "../_components/fields";
import { OpsPageHeader } from "../_components/page-header";
import { EndPeriodForm, ProviderCostForm } from "../_components/period-forms";
import { PeriodTable } from "../_components/period-table";
import { createProviderCost, endProviderCost } from "../actions";

// Custos dos provedores (ADR 0007): só o Ops vê; alimentam a margem por Pedido.
export const dynamic = "force-dynamic";

export default async function ProviderCostsPage() {
  await requirePermission("ops.area");
  const costs = await opsRead((api, caller) => api.opsListProviderCosts(caller));
  const rows = costs.map((cost) => ({
    id: cost.id,
    label: `${PROVIDER_LABEL[cost.provider]} · ${PROVIDER_OPERATION_LABEL[cost.operation]}`,
    percentBps: cost.percentBps,
    fixedCents: cost.fixedCents,
    validFrom: cost.validFrom,
    validTo: cost.validTo,
    action:
      cost.validTo === null ? (
        <EndPeriodForm action={endProviderCost} idName="costId" label="custo" recordId={cost.id} />
      ) : null,
  }));

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Custos dos provedores"
        description="O que AbacatePay e Efí cobram da Foode por operação. Visível só para o Ops; nunca aparece para a Loja."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <OutlineContainer className="p-6">
          <SectionHeading id="tabela">Custos com vigência</SectionHeading>
          <div className="mt-4">
            <PeriodTable
              caption="Custos dos provedores"
              emptyTitle="Nenhum custo cadastrado."
              emptyHint={<p>Cadastre ao lado o custo de cada operação por provedor.</p>}
              rows={rows}
            />
          </div>
        </OutlineContainer>
        <OutlineContainer className="p-6">
          <SectionHeading
            id="novo"
            description="Sobreposição no mesmo provedor e operação é recusada: encerre o anterior antes."
          >
            Novo custo
          </SectionHeading>
          <div className="mt-5">
            <ProviderCostForm action={createProviderCost} />
          </div>
        </OutlineContainer>
      </div>
    </section>
  );
}
