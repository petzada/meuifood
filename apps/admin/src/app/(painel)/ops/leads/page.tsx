import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadStatus,
  ORDERS_PER_DAY_LABELS,
} from "@foode/shared/lead";
import { OutlineContainer } from "@foode/ui";
import Link from "next/link";

import { formatDateTimeSp } from "../../../../lib/ops-format";
import { opsRead } from "../../../../lib/ops-rpc";
import { requirePermission } from "../../../../lib/session";
import { OpsPageHeader } from "../_components/page-header";
import { setLeadStatus } from "./actions";
import { LeadStatusForm } from "./lead-status-form";

// Leads da landing (Ticket 31, decisão 70): contatos do formulário "Quero falar com a Foode",
// mais recentes primeiro (até 200), com filtro por status e troca auditada. Só `foode_ops`; a
// api confere de novo. Sem exportação.
export const dynamic = "force-dynamic";

function statusFilter(raw: string | string[] | undefined): LeadStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (LEAD_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as LeadStatus)
    : undefined;
}

function phoneLabel(e164: string): string {
  // 55 DD 9XXXX-XXXX
  const local = e164.slice(2);
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
}

export default async function OpsLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("ops.area");
  const status = statusFilter((await searchParams).status);
  const leads = await opsRead((api, caller) => api.opsListLeads(caller, status ? { status } : {}));
  const filters: { href: string; label: string; current: boolean }[] = [
    { href: "/ops/leads", label: "Todos", current: status === undefined },
    ...LEAD_STATUSES.map((option) => ({
      href: `/ops/leads?status=${option}`,
      label: LEAD_STATUS_LABELS[option],
      current: status === option,
    })),
  ];

  return (
    <section className="mx-auto max-w-6xl">
      <OpsPageHeader
        title="Leads"
        description="Contatos deixados no formulário da landing. Responda pelo WhatsApp informado e registre aqui o andamento; cada troca de status é auditada."
      />
      <nav aria-label="Filtrar leads por status" className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            aria-current={filter.current ? "page" : undefined}
            className={[
              "rounded-full border px-3 py-1 text-sm font-bold",
              filter.current
                ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                : "border-[var(--color-hairline)] text-[var(--color-body)]",
            ].join(" ")}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <OutlineContainer className="mt-6 overflow-x-auto p-0">
        {leads.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-body)]">Nenhum lead por aqui ainda.</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Leads da landing</caption>
            <thead className="border-b border-[var(--color-hairline)] text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th scope="col" className="p-4">
                  Recebido
                </th>
                <th scope="col" className="p-4">
                  Contato
                </th>
                <th scope="col" className="p-4">
                  Loja
                </th>
                <th scope="col" className="p-4">
                  Pedidos/dia
                </th>
                <th scope="col" className="p-4">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-[var(--color-hairline-soft)] align-top last:border-0"
                >
                  <td className="p-4 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateTimeSp(lead.createdAt)}
                    {lead.source ? (
                      <span className="block text-xs text-[var(--color-muted)]">{lead.source}</span>
                    ) : null}
                  </td>
                  <td className="p-4">
                    <span className="block font-bold text-[var(--color-ink)]">{lead.name}</span>
                    <span className="block text-[var(--color-body)]">
                      {phoneLabel(lead.whatsapp)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="block text-[var(--color-ink)]">{lead.storeName}</span>
                    <span className="block text-[var(--color-body)]">{lead.city}</span>
                  </td>
                  <td className="p-4 text-[var(--color-body)]">
                    {ORDERS_PER_DAY_LABELS[lead.ordersPerDay]}
                  </td>
                  <td className="p-4">
                    <LeadStatusForm
                      action={setLeadStatus}
                      leadId={lead.id}
                      leadName={lead.name}
                      status={lead.status}
                    />
                    {lead.statusChangedAt ? (
                      <span className="mt-1 block text-xs text-[var(--color-muted)]">
                        {formatDateTimeSp(lead.statusChangedAt)}
                        {lead.statusChangedByEmail ? ` · ${lead.statusChangedByEmail}` : ""}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </OutlineContainer>
    </section>
  );
}
