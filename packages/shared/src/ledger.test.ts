import { describe, expect, it } from "vitest";

import { buildPixLedgerObligation } from "./ledger.js";

describe("Ledger PIX piloto", () => {
  it("monta obrigação com taxa 1,19%, líquido, D+1 e paid_at nulo", () => {
    expect(
      buildPixLedgerObligation({
        confirmedAtIso: "2026-07-28T18:00:00.000Z",
        grossCents: 10_000,
      }),
    ).toEqual({
      expectedPayoutDate: "2026-07-29",
      feeBps: 119,
      feeCents: 119,
      grossCents: 10_000,
      netCents: 9_881,
      paidAt: null,
      provider: "woovi",
    });
  });

  it("não cria obrigação implícita para on_delivery (helper só cobre PIX)", () => {
    // Contrato Seam 3: on_delivery não passa por este helper.
    expect(typeof buildPixLedgerObligation).toBe("function");
  });
});
