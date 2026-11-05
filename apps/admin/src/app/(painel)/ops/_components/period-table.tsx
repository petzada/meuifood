// Tabela de linhas com vigência (taxas Foode e custos de provedor): valor, vigência em
// São Paulo, estado (vigente/futura/encerrada) e a ação de encerrar. Server Component; a
// coluna de ação recebe o formulário já montado.
import type { ReactNode } from "react";

import { formatBps, formatCents, formatDateTimeSp } from "../../../../lib/ops-format";
import { PeriodBadge } from "./badges";
import { EmptyState } from "./fields";

export type PeriodRow = {
  id: string;
  label: string;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  action?: ReactNode;
};

export function PeriodTable({
  caption,
  emptyTitle,
  emptyHint,
  rows,
}: {
  caption: string;
  emptyHint?: ReactNode;
  emptyTitle: string;
  rows: PeriodRow[];
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--color-hairline)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            <th scope="col" className="py-3 pr-4">
              Item
            </th>
            <th scope="col" className="px-4 py-3">
              Valor
            </th>
            <th scope="col" className="px-4 py-3">
              Vigência
            </th>
            <th scope="col" className="px-4 py-3">
              Estado
            </th>
            <th scope="col" className="py-3 pl-4 text-right">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[var(--color-hairline-soft)] align-top last:border-b-0"
            >
              <th scope="row" className="py-4 pr-4 text-left font-bold text-[var(--color-ink)]">
                {row.label}
              </th>
              <td className="px-4 py-4 text-[var(--color-ink)]">
                {formatBps(row.percentBps)}
                {row.fixedCents > 0 ? ` + ${formatCents(row.fixedCents)}` : ""}
              </td>
              <td className="px-4 py-4 text-[var(--color-body)]">
                {formatDateTimeSp(row.validFrom)}
                <span className="block text-xs text-[var(--color-muted)]">
                  {row.validTo ? `até ${formatDateTimeSp(row.validTo)}` : "sem fim"}
                </span>
              </td>
              <td className="px-4 py-4">
                <PeriodBadge validFrom={row.validFrom} validTo={row.validTo} />
              </td>
              <td className="py-4 pl-4 text-right">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
