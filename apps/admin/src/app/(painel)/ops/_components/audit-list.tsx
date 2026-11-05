// Trilha de auditoria da Loja (OPS-05): quem, quando, antes/depois, mais recente primeiro.
import type { OpsAuditEntry } from "@foode/shared/ops";

import { formatDateTimeSp } from "../../../../lib/ops-format";
import { auditActionLabel } from "../../../../lib/ops-labels";
import { EmptyState } from "./fields";

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--color-hairline-soft)] p-3 font-mono text-xs leading-relaxed text-[var(--color-body)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditList({ entries }: { entries: OpsAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState title="Nenhum evento registrado.">
        <p>Toda alteração feita pelo Ops nesta Loja aparece aqui.</p>
      </EmptyState>
    );
  }
  return (
    <ol className="divide-y divide-[var(--color-hairline-soft)]">
      {entries.map((entry) => (
        <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-bold text-[var(--color-ink)]">{auditActionLabel(entry.action)}</p>
            <time dateTime={entry.occurredAt} className="text-sm text-[var(--color-muted)]">
              {formatDateTimeSp(entry.occurredAt)}
            </time>
          </div>
          <p className="mt-0.5 text-sm text-[var(--color-body)]">
            {entry.actorEmail ??
              (entry.actorUserId ? `Usuário ${entry.actorUserId.slice(0, 8)}` : "Sistema")}
            {entry.targetType && entry.targetType !== "store" ? ` · ${entry.targetType}` : ""}
          </p>
          {entry.before !== null || entry.after !== null ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-bold text-[var(--color-body)]">
                Antes / depois
              </summary>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Json label="Antes" value={entry.before} />
                <Json label="Depois" value={entry.after} />
              </div>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
