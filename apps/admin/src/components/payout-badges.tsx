// Selos do Financeiro (T-03: texto + símbolo + cor, nunca só cor). Server-safe.
import { PAYOUT_LINE_STATUS_LABEL, type PayoutLineStatus } from "@foode/shared/finance";

import {
  PAYOUT_LINE_STATUS_CLASSES,
  PAYOUT_LINE_STATUS_GLYPH,
  PAYOUT_SOURCE_ACCOUNT_LABEL,
} from "../lib/finance-labels";
import type { PayoutSourceAccount } from "@foode/shared/finance";

export function PayoutStatusBadge({ status }: { status: PayoutLineStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${PAYOUT_LINE_STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true">{PAYOUT_LINE_STATUS_GLYPH[status]}</span>
      {PAYOUT_LINE_STATUS_LABEL[status]}
    </span>
  );
}

export function SourceAccountBadge({ account }: { account: PayoutSourceAccount }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--color-hairline)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-body)]">
      {PAYOUT_SOURCE_ACCOUNT_LABEL[account]}
    </span>
  );
}
