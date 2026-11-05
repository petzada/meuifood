// Regras do Estorno (Ticket 12): estado público, chave idempotente, retentativa e reversão do
// Ledger antes/depois do repasse.
import { describe, expect, it } from "vitest";

import {
  compensationPayoutDate,
  ledgerReversalKind,
  nextRefundAttemptAt,
  planLedgerReversal,
  publicRefundState,
  REFUND_RETRY_BASE_MS,
  REFUND_RETRY_MAX_MS,
  refundIdempotencyKey,
  refundRetryDelayMs,
  storePayoutBalanceCents,
} from "./refund.js";

const entry = {
  chargedCents: 4_650,
  orderTotalCents: 4_500,
  serviceFeeCents: 150,
  foodeFeeCents: 157,
  netCents: 4_343,
  expectedPayoutDate: "2026-11-06",
  paidOut: false,
};

describe("estado e chave do Estorno", () => {
  it("requested continua em andamento; failed = nova tentativa automática", () => {
    expect(publicRefundState("pending")).toBe("pending");
    expect(publicRefundState("requested")).toBe("pending");
    expect(publicRefundState("succeeded")).toBe("succeeded");
    expect(publicRefundState("failed")).toBe("failed_retrying");
  });

  it("chave estável por cobrança paga", () => {
    expect(refundIdempotencyKey("abc")).toBe("refund:abc");
    expect(refundIdempotencyKey("abc")).toBe(refundIdempotencyKey("abc"));
  });

  it("espera exponencial com teto", () => {
    expect(refundRetryDelayMs(0)).toBe(REFUND_RETRY_BASE_MS);
    expect(refundRetryDelayMs(1)).toBe(REFUND_RETRY_BASE_MS);
    expect(refundRetryDelayMs(2)).toBe(2 * REFUND_RETRY_BASE_MS);
    expect(refundRetryDelayMs(4)).toBe(8 * REFUND_RETRY_BASE_MS);
    expect(refundRetryDelayMs(1_000)).toBe(REFUND_RETRY_MAX_MS);
    expect(refundRetryDelayMs(Number.NaN)).toBe(REFUND_RETRY_BASE_MS);
    const now = new Date("2026-11-05T12:00:00.000Z");
    expect(nextRefundAttemptAt(now, 3).toISOString()).toBe("2026-11-05T12:04:00.000Z");
  });
});

describe("reversão do Ledger", () => {
  it("antes do repasse: anula no mesmo repasse previsto, com tudo devolvido", () => {
    const plan = planLedgerReversal(entry, new Date("2026-11-05T15:00:00.000Z"));
    expect(plan).toEqual({
      kind: "annulment",
      refundedCents: 4_650,
      orderTotalCents: 4_500,
      serviceFeeCents: 150,
      foodeFeeCents: 157,
      netCents: 4_343,
      expectedPayoutDate: "2026-11-06",
    });
  });

  it("depois do repasse: débito compensado a partir do próximo dia útil", () => {
    // Sexta 2026-11-13 → segunda 2026-11-16 (sábado/domingo não são úteis).
    const plan = planLedgerReversal(
      { ...entry, paidOut: true },
      new Date("2026-11-13T15:00:00.000Z"),
    );
    expect(plan.kind).toBe("compensated_debit");
    expect(plan.expectedPayoutDate).toBe("2026-11-16");
    expect(compensationPayoutDate(new Date("2026-11-13T15:00:00.000Z"))).toBe("2026-11-16");
    expect(ledgerReversalKind(true)).toBe("compensated_debit");
    expect(ledgerReversalKind(false)).toBe("annulment");
  });

  it("recusa lançamento inconsistente ou fora da faixa", () => {
    expect(() => planLedgerReversal({ ...entry, netCents: 1 }, new Date())).toThrow(RangeError);
    expect(() => planLedgerReversal({ ...entry, chargedCents: -1 }, new Date())).toThrow(
      RangeError,
    );
  });

  it("saldo do lojista: anulação zera; débito fica negativo até compensar", () => {
    expect(storePayoutBalanceCents([entry], [])).toBe(4_343);
    expect(storePayoutBalanceCents([entry], [{ kind: "annulment", netCents: 4_343 }])).toBe(0);
    expect(
      storePayoutBalanceCents(
        [{ netCents: 4_343, paidOut: true }],
        [{ kind: "compensated_debit", netCents: 4_343 }],
      ),
    ).toBe(-4_343);
  });
});
