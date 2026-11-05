import { OutlineContainer } from "@foode/ui";
import type { PaymentFeeView } from "@foode/shared/ops";

import { Notice } from "../../../../../components/form";
import {
  formatCep,
  formatCnpj,
  formatDateTimeSp,
  formatWhatsapp,
} from "../../../../../lib/ops-format";
import { feeLabel, PIX_KEY_TYPE_LABEL } from "../../../../../lib/ops-labels";
import { opsRead } from "../../../../../lib/ops-rpc";
import { requirePermission } from "../../../../../lib/session";
import { turnstileSiteKey } from "../../../../../lib/turnstile";
import { AuditList } from "../../_components/audit-list";
import { Facts, SectionHeading } from "../../_components/fields";
import { OwnerInviteForm } from "../../_components/owner-invite-form";
import { OpsPageHeader } from "../../_components/page-header";
import { EndPeriodForm, PaymentFeeForm } from "../../_components/period-forms";
import { PeriodTable } from "../../_components/period-table";
import { CardModePanel, PlanPanel } from "../../_components/plan-card-panel";
import { StoreStatusPanel } from "../../_components/store-status-panel";
import { EditStoreForms } from "../../_components/store-form";
import { StoreStatusBadge } from "../../_components/badges";
import {
  activateStore,
  checkSlug,
  createPaymentFee,
  endPaymentFee,
  inviteOwner,
  setCardMode,
  setStorePlan,
  suspendStore,
  updateStore,
} from "../../actions";

// Detalhe da Loja no Ops: estado e ativação, cadastro por seções, Dono, Plano e cartão,
// taxas Foode da Loja (override) e auditoria (OPS-02..05).
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "loja-criada": "Loja cadastrada. Agora convide o Dono e defina o Plano para ativá-la.",
};

function feeRows(fees: PaymentFeeView[], storeId: string) {
  return fees.map((fee) => ({
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
          storeId={storeId}
        />
      ) : null,
  }));
}

export default async function OpsStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  await requirePermission("ops.area");
  const { storeId } = await params;
  const { aviso } = await searchParams;

  const store = await opsRead((api, caller) => api.opsGetStore(caller, { storeId }));
  const [fees, audit] = await Promise.all([
    opsRead((api, caller) => api.opsListPaymentFees(caller, { storeId })),
    opsRead((api, caller) => api.opsListStoreAudit(caller, { storeId })),
  ]);
  const notice = aviso ? NOTICES[aviso] : undefined;
  const profileComplete = store.address !== null && store.payout !== null && store.cnpj !== null;

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        crumbs={[{ href: "/ops", label: "Lojas" }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {store.name}
            <StoreStatusBadge status={store.status} />
          </span>
        }
        description={
          <>
            /{store.slug} · cadastrada em {formatDateTimeSp(store.createdAt)} · atualizada em{" "}
            {formatDateTimeSp(store.updatedAt)}
          </>
        }
      />

      {notice ? (
        <div className="mt-6">
          <Notice tone="success">{notice}</Notice>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <OutlineContainer className="p-6 md:p-8">
            <StoreStatusPanel
              activate={activateStore}
              onboarding={store.onboarding}
              status={store.status}
              storeId={store.id}
              storeName={store.name}
              suspend={suspendStore}
            />
          </OutlineContainer>

          <OutlineContainer className="p-6 md:p-8">
            <div className="space-y-8">
              <div className="space-y-5">
                <SectionHeading
                  id="cadastro"
                  description={
                    profileComplete
                      ? "Resumo do cadastro. Cada seção abaixo salva sozinha."
                      : "Loja anterior ao cadastro completo: faltam CNPJ, endereço ou dados de Repasse. Complete nas seções abaixo."
                  }
                >
                  Cadastro
                </SectionHeading>
                <Facts
                  items={[
                    { label: "CNPJ", value: formatCnpj(store.cnpj) },
                    { label: "WhatsApp", value: formatWhatsapp(store.whatsapp) },
                    {
                      label: "Endereço",
                      value: store.address
                        ? `${store.address.street}, ${store.address.number}${store.address.complement ? ` (${store.address.complement})` : ""} · ${store.address.district}, ${store.address.city}/${store.address.state} · CEP ${formatCep(store.address.postalCode)}`
                        : "—",
                    },
                    {
                      label: "Repasse",
                      value: store.payout
                        ? `${PIX_KEY_TYPE_LABEL[store.payout.pixKeyType]} ${store.payout.pixKey} · ${store.payout.holderName}`
                        : "—",
                    },
                  ]}
                />
              </div>
              <EditStoreForms
                action={updateStore}
                checkSlug={checkSlug}
                store={{
                  id: store.id,
                  slug: store.slug,
                  name: store.name,
                  cnpj: store.cnpj,
                  whatsapp: store.whatsapp,
                  address: store.address,
                  payout: store.payout,
                }}
              />
            </div>
          </OutlineContainer>

          <OutlineContainer className="p-6 md:p-8">
            <div className="space-y-5">
              <SectionHeading
                id="taxas-loja"
                description="Override da tabela padrão para esta Loja. Sem override vigente, vale a taxa padrão; meio sem taxa vigente fica fora do checkout."
              >
                Taxas Foode desta Loja
              </SectionHeading>
              <PeriodTable
                caption="Taxas Foode desta Loja"
                emptyTitle="Nenhum override: a Loja usa a tabela padrão."
                emptyHint={<p>Cadastre abaixo só se esta Loja tiver condição diferente.</p>}
                rows={feeRows(fees, store.id)}
              />
              <details className="rounded-2xl border border-[var(--color-hairline-soft)] p-4">
                <summary className="cursor-pointer font-bold text-[var(--color-ink)]">
                  Nova taxa para esta Loja
                </summary>
                <div className="mt-4">
                  <PaymentFeeForm action={createPaymentFee} storeId={store.id} />
                </div>
              </details>
            </div>
          </OutlineContainer>

          <OutlineContainer className="p-6 md:p-8">
            <div className="space-y-5">
              <SectionHeading
                id="auditoria"
                description="Quem fez o quê nesta Loja, do mais recente ao mais antigo."
              >
                Auditoria
              </SectionHeading>
              <AuditList entries={audit} />
            </div>
          </OutlineContainer>
        </div>

        <div className="space-y-6">
          <OutlineContainer className="p-6">
            <OwnerInviteForm
              action={inviteOwner}
              owners={store.owners}
              siteKey={turnstileSiteKey()}
              storeId={store.id}
            />
            <p className="mt-5 border-t border-[var(--color-hairline-soft)] pt-4 text-sm text-[var(--color-muted)]">
              Perfil do Dono (culinária e objetivo): respondido no primeiro acesso ao Painel;
              aparece aqui quando existir.
            </p>
          </OutlineContainer>
          <OutlineContainer className="p-6">
            <PlanPanel
              action={setStorePlan}
              plan={store.plan}
              planHistory={store.planHistory}
              storeId={store.id}
            />
          </OutlineContainer>
          <OutlineContainer className="p-6">
            <CardModePanel action={setCardMode} cardMode={store.cardMode} storeId={store.id} />
          </OutlineContainer>
        </div>
      </div>
    </section>
  );
}
