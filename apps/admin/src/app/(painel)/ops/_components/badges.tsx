// Selos de estado da área Ops (T-03: texto + símbolo + cor, nunca só cor). Sem fill além do
// selo pequeno; cor do texto escurecida para passar no AA (T-02).
import type { StoreStatus } from "@foode/shared/auth";

import { periodState } from "../../../../lib/ops-format";
import { STORE_STATUS_GLYPH, STORE_STATUS_LABEL } from "../../../../lib/ops-labels";

const STATUS_CLASSES: Record<StoreStatus, string> = {
  onboarding: "border-[var(--color-accent)] text-[#7a5600]",
  active: "border-[#2e7d32] text-[#1f5f23]",
  suspended: "border-[var(--color-error)] text-[var(--color-error)]",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true">{STORE_STATUS_GLYPH[status]}</span>
      {STORE_STATUS_LABEL[status]}
    </span>
  );
}

const PERIOD_LABEL = { future: "Futura", current: "Vigente", ended: "Encerrada" } as const;
const PERIOD_CLASSES = {
  future: "border-[var(--color-accent)] text-[#7a5600]",
  current: "border-[#2e7d32] text-[#1f5f23]",
  ended: "border-[var(--color-hairline)] text-[var(--color-muted)]",
} as const;

export function PeriodBadge({ validFrom, validTo }: { validFrom: string; validTo: string | null }) {
  const state = periodState(validFrom, validTo);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${PERIOD_CLASSES[state]}`}
    >
      {PERIOD_LABEL[state]}
    </span>
  );
}

/** Marca de item do checklist: feito ou pendente, com texto. */
export function CheckMark({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
        done
          ? "border-[#2e7d32] bg-[#2e7d32] text-white"
          : "border-[var(--color-hairline)] text-transparent"
      }`}
      aria-hidden="true"
    >
      ✓
    </span>
  );
}
