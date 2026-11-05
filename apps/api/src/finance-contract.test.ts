// Contrato do financeiro (Ticket 14) sem banco: enums do D1 = os de @foode/shared/finance e o
// mapeamento das linhas/lotes do Dono não vaza custo do envio nem quem marcou o lote.
import {
  PAYOUT_ITEM_KINDS as DB_ITEM_KINDS,
  PAYOUT_SOURCE_ACCOUNTS as DB_ACCOUNTS,
} from "@foode/db";
import { PAYOUT_ITEM_KINDS, PAYOUT_SOURCE_ACCOUNTS } from "@foode/shared/finance";
import { describe, expect, it } from "vitest";

import { rolesWith } from "./auth/guard";
import { toOwnerBatch, toPayoutLine } from "./finance-service";

describe("contrato do financeiro", () => {
  it("enums do D1 batem com o contrato", () => {
    expect([...DB_ITEM_KINDS]).toEqual([...PAYOUT_ITEM_KINDS]);
    expect([...DB_ACCOUNTS]).toEqual([...PAYOUT_SOURCE_ACCOUNTS]);
  });

  it("só o Dono tem store.finance", () => {
    expect(rolesWith("store.finance")).toEqual(["owner"]);
  });

  it("lote do Dono sem custo do envio nem autor", () => {
    const view = toOwnerBatch({
      id: "b1",
      storeId: "s1",
      payoutDate: "2026-11-05",
      paidOn: "2026-11-05",
      sourceAccount: "efi",
      reference: "E2E",
      transferCostCents: 80,
      entriesCents: 1000,
      debitsCents: 0,
      adjustmentsCents: 0,
      amountCents: 1000,
      itemCount: 1,
      createdByUserId: "u1",
      createdAt: "2026-11-05T15:00:00.000Z",
    });
    expect(view).not.toHaveProperty("transferCostCents");
    expect(view).not.toHaveProperty("createdByUserId");
    expect(view).not.toHaveProperty("storeId");
  });

  it("linha: status a partir dos fatos e de hoje", () => {
    const row = {
      id: "e1",
      kind: "payment" as const,
      orderCode: 7,
      method: "pix" as const,
      cardMode: null,
      orderTotalCents: 5000,
      foodeFeeCents: 100,
      serviceFeeCents: 150,
      netCents: 4900,
      expectedPayoutDate: "2026-11-06",
      paid: 0,
      annulled: 0,
      batchId: null,
      reason: null,
      occurredAt: "2026-11-05T15:00:00.000Z",
    };
    expect(toPayoutLine(row, "2026-11-05").status).toBe("scheduled");
    expect(toPayoutLine(row, "2026-11-06").status).toBe("in_batch");
    expect(toPayoutLine({ ...row, paid: 1 }, "2026-11-06").status).toBe("paid");
    expect(toPayoutLine({ ...row, annulled: 1 }, "2026-11-06").status).toBe("annulled");
  });
});
