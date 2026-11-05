import { OutlineContainer } from "@foode/ui";

import { feeLabel } from "../../../../lib/ops-labels";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { SectionHeading } from "../_components/fields";
import { OpsPageHeader } from "../_components/page-header";
import { EndPeriodForm, PaymentFeeForm } from "../_components/period-forms";
import { PeriodTable } from "../_components/period-table";
import { createPaymentFee, endPaymentFee } from "../actions";

// Taxas Foode da tabela padrão (decisões 60/61): nasce vazia; meio sem taxa vigente fica
// fora do checkout. Override por Loja fica no detalhe da Loja.
export const dynamic = "force-dynamic";

export default async function PaymentFeesPage() {
  await requirePermission("ops.area");
  const fees = await opsRead((api, caller) => api.opsListPaymentFees(caller, { storeId: null }));
  const rows = fees.map((fee) => ({
    id: fee.id,
    label: feeLabel(fee.method, fee.cardMode),
    percentBps: fee.percentBps,
    fixedCents: fee.fixedCents,
    validFrom: fee.validFrom,
    validTo: fee.validTo,
    action:
      fee.validTo === null ? (
        <EndPeriodForm
          action={endPaymentFee}
          idName="feeId"
          label="taxa"
          recordId={fee.id}
          storeId={null}
        />
      ) : null,
  }));

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Taxas Foode"
        description="Tabela padrão por meio de pagamento (PIX, Crédito Normal, Crédito Rápido), sempre com vigência. Um meio sem taxa vigente fica fora do checkout de todas as Lojas sem override."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <OutlineContainer className="p-6">
          <SectionHeading id="tabela">Tabela padrão</SectionHeading>
          <div className="mt-4">
            <PeriodTable
              caption="Taxas Foode padrão"
              emptyTitle="Nenhuma taxa cadastrada."
              emptyHint={
                <p>Sem taxa vigente, PIX e Crédito ficam fora do checkout. Cadastre ao lado.</p>
              }
              rows={rows}
            />
          </div>
        </OutlineContainer>
        <OutlineContainer className="p-6">
          <SectionHeading
            id="nova"
            description="Vigência futura mostra “vale a partir de”. O valor não é editado depois, só encerrado."
          >
            Nova taxa padrão
          </SectionHeading>
          <div className="mt-5">
            <PaymentFeeForm action={createPaymentFee} storeId={null} />
          </div>
        </OutlineContainer>
      </div>
    </section>
  );
}
