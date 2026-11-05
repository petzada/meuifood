// Ticket 15 sem banco: escolha da rotina pelo Cron, isolamento de falha entre unidades e alerta de
// divergência (só contagens). O handler real com D1 está em reconciliacao.d1.test.ts.
import { describe, expect, it, vi } from "vitest";

import type { PaymentMaintenance } from "./payment-maintenance";
import {
  CRON_PAYMENTS,
  CRON_SETTLEMENT,
  jobOfCron,
  type ReconciliationReporter,
  runUnits,
  unitErrorCode,
  unitsFor,
} from "./reconciliation";

const NOW = new Date("2026-11-05T15:00:00.000Z");

function maintenance(overrides: Partial<PaymentMaintenance> = {}): PaymentMaintenance {
  return {
    reconcilePix: vi.fn(async () => ({ checked: 1, paid: 1, expired: 0, failed: 0 })),
    expireUnpaidPix: vi.fn(async () => ({ cancelled: 0, paid: 0, skipped: 0, failed: 0 })),
    expireStaleCardAttempts: vi.fn(async () => ({ gaveUp: 0, checked: 0, failed: 1 })),
    cancelAbandonedCards: vi.fn(async () => ({ cancelled: 1, failed: 0 })),
    retryPendingRefunds: vi.fn(async () => ({
      attempted: 1,
      succeeded: 0,
      requested: 1,
      failed: 0,
      confirmed: 0,
      checkFailed: 1,
    })),
    reconcileCardReleases: vi.fn(async () => ({ checked: 2, confirmed: 1, failed: 0 })),
    detectPayoutDivergences: vi.fn(async () => ({
      paidWithoutLedger: 0,
      ledgerMismatch: 0,
      cancelledPaidWithoutRefund: 0,
      refundWithoutReversal: 0,
      payoutDueUnreleased: 0,
      retentionsOverNet: 0,
      payoutStoreMismatch: 0,
    })),
    ...overrides,
  };
}

function reporter() {
  const alerts: Parameters<ReconciliationReporter["alert"]>[] = [];
  const value: ReconciliationReporter = {
    log: vi.fn(),
    alert: (...args) => {
      alerts.push(args);
    },
  };
  return { value, alerts };
}

describe("jobOfCron", () => {
  it("diário = settlement; 5 min e qualquer outro = payments", () => {
    expect(jobOfCron(CRON_SETTLEMENT)).toBe("settlement");
    expect(jobOfCron(CRON_PAYMENTS)).toBe("payments");
    expect(jobOfCron("* * * * *")).toBe("payments");
  });
});

describe("runUnits", () => {
  it("unidade que lança não esconde as demais; falhas por item somadas", async () => {
    const m = maintenance({
      expireUnpaidPix: vi.fn(async () => {
        throw new TypeError("D1 indisponível: dado sensível na mensagem");
      }),
    });
    const { value } = reporter();
    const result = await runUnits(unitsFor("payments", m, NOW, value));
    expect(result.failedUnits).toEqual([{ unit: "pixExpire", code: "TypeError" }]);
    expect(Object.keys(result.units)).toEqual([
      "pixReconcile",
      "cardStale",
      "cardAbandoned",
      "refunds",
    ]);
    // cardStale.failed (1) + refunds.checkFailed (1).
    expect(result.itemFailures).toBe(2);
    expect(m.retryPendingRefunds).toHaveBeenCalledWith(NOW);
    expect(JSON.stringify(result)).not.toContain("sensível");
  });

  it("código do erro é o nome, nunca a mensagem", () => {
    expect(unitErrorCode(new RangeError("cpf 52998224725"))).toBe("RangeError");
    expect(unitErrorCode("texto")).toBe("unknown");
  });
});

describe("settlement", () => {
  it("sem divergência: sem alerta", async () => {
    const { value, alerts } = reporter();
    const result = await runUnits(unitsFor("settlement", maintenance(), NOW, value));
    expect(result.units).toMatchObject({
      cardReleases: { checked: 2, confirmed: 1, failed: 0 },
      payoutDivergences: { total: 0 },
    });
    expect(alerts).toEqual([]);
  });

  it("divergência vira alerta com os tipos e as contagens (nada é corrigido)", async () => {
    const { value, alerts } = reporter();
    const m = maintenance({
      detectPayoutDivergences: vi.fn(async () => ({
        paidWithoutLedger: 0,
        ledgerMismatch: 0,
        cancelledPaidWithoutRefund: 1,
        refundWithoutReversal: 0,
        payoutDueUnreleased: 2,
        retentionsOverNet: 0,
        payoutStoreMismatch: 0,
      })),
    });
    const result = await runUnits(unitsFor("settlement", m, NOW, value));
    expect(result.units.payoutDivergences).toMatchObject({ total: 3 });
    expect(alerts).toEqual([
      [
        "payout_divergence",
        "warning",
        { job: "settlement", kinds: "cancelledPaidWithoutRefund,payoutDueUnreleased" },
        expect.objectContaining({ payoutDueUnreleased: 2 }),
      ],
    ]);
  });
});
