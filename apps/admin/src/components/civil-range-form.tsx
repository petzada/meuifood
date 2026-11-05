// Filtro de período por datas civis (Repasses, lotes e margem): formulário GET que recarrega a
// página com `?de=…&ate=…` (a consulta roda no servidor, sem estado no cliente). Server-safe.
import { REPORT_MAX_DAYS } from "@foode/shared/finance";
import type { ReactNode } from "react";

const INPUT =
  "mt-1 block min-h-11 rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base font-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]";

export function CivilRangeForm({
  action,
  children,
  from,
  hint,
  label = "Período",
  to,
}: {
  /** Caminho da página (o GET volta para cá). */
  action: string;
  /** Campos extras (ex.: seletor de Loja), mantidos na query. */
  children?: ReactNode;
  from: string;
  hint?: string;
  label?: string;
  to: string;
}) {
  return (
    <form
      action={action}
      method="get"
      aria-label={label}
      className="foode-print-hide flex flex-wrap items-end gap-3"
    >
      {children}
      <label className="text-sm font-bold text-[var(--color-ink)]">
        De
        <input type="date" name="de" required defaultValue={from} className={INPUT} />
      </label>
      <label className="text-sm font-bold text-[var(--color-ink)]">
        Até
        <input type="date" name="ate" required defaultValue={to} className={INPUT} />
      </label>
      <button type="submit" className="foode-button foode-button--secondary">
        Aplicar período
      </button>
      <p className="basis-full text-sm text-[var(--color-muted)]">
        {hint ?? `Até ${REPORT_MAX_DAYS} dias (dias de Brasília).`}
      </p>
    </form>
  );
}
