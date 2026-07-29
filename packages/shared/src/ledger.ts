import {
  pixExpectedPayoutDate,
  pixFeeCents,
  pixNetCents,
  PIX_FEE_RATE_BPS,
} from "./money.js";

export type PixLedgerObligation = {
  expectedPayoutDate: string;
  feeBps: typeof PIX_FEE_RATE_BPS;
  feeCents: number;
  grossCents: number;
  netCents: number;
  paidAt: null;
  provider: "woovi";
};

/** Obrigação de repasse PIX no Ledger piloto — paid_at sempre nulo na criação. */
export function buildPixLedgerObligation(input: {
  confirmedAtIso: string;
  grossCents: number;
  providerSettlementDate?: string | null;
}): PixLedgerObligation {
  const feeCents = pixFeeCents(input.grossCents);
  return {
    expectedPayoutDate: pixExpectedPayoutDate({
      confirmedAtIso: input.confirmedAtIso,
      ...(input.providerSettlementDate !== undefined
        ? { providerSettlementDate: input.providerSettlementDate }
        : {}),
    }),
    feeBps: PIX_FEE_RATE_BPS,
    feeCents,
    grossCents: input.grossCents,
    netCents: pixNetCents(input.grossCents),
    paidAt: null,
    provider: "woovi",
  };
}
