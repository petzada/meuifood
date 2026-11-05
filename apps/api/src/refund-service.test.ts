// Estorno automático sem banco (Ticket 12): provedores como dublês controlados (AbacatePay e Efí)
// e `db.refunds` em memória com as mesmas regras de estado do refund-db (lease, só para frente).
// A atomicidade do cancelamento, o Ledger e o isolamento entre Lojas ficam em
// cancelamento.d1.test.ts (CI).
import type { FoodeDb, RefundView } from "@foode/db";
import { REFUND_RETRY_BASE_MS } from "@foode/shared/payment";
import { describe, expect, it, vi } from "vitest";

import { AbacatePayError } from "./providers/abacatepay/errors";
import { EfiError } from "./providers/efi/client";
import {
  type AbacatePayRefundGateway,
  createRefundService,
  type EfiRefundGateway,
  REFUND_CHECK_INTERVAL_MS,
  type RefundIncident,
  refundErrorCode,
  refundGatewaysFromEnv,
} from "./refund-service";

const NOW = new Date("2026-11-05T15:00:00.000Z");

function refund(overrides: Partial<RefundView> = {}): RefundView {
  return {
    refundId: "refund-1",
    storeId: "store-a",
    orderId: "order-a",
    intentId: "intent-1",
    idempotencyKey: "refund:intent-1",
    provider: "abacatepay",
    method: "pix",
    cardMode: null,
    providerChargeId: "pix_char_TESTE01",
    amountCents: 5_330,
    serviceFeeCents: 150,
    origin: "order_cancelled",
    state: "pending",
    attempts: 0,
    nextAttemptAt: null,
    attemptStartedAt: null,
    checkedAt: null,
    lastErrorCode: null,
    providerRefundId: null,
    requestedAt: null,
    succeededAt: null,
    createdAt: "2026-11-05T14:59:00.000Z",
    updatedAt: "2026-11-05T14:59:00.000Z",
    ...overrides,
  };
}

/** `db.refunds` em memória: as transições do refund-db (UPDATEs condicionais). */
function fakeRefunds(initial: RefundView[]) {
  const rows = new Map(initial.map((row) => [row.refundId, { ...row }]));
  const ops = {
    rows,
    byId: vi.fn(async (id: string) => (rows.has(id) ? { ...rows.get(id)! } : null)),
    ofIntent: vi.fn(
      async (intentId: string) => [...rows.values()].find((r) => r.intentId === intentId) ?? null,
    ),
    claim: vi.fn(async (id: string, now: string, staleBefore: string) => {
      const row = rows.get(id);
      if (!row || (row.state !== "pending" && row.state !== "failed")) return false;
      if (row.attemptStartedAt && row.attemptStartedAt >= staleBefore) return false;
      if (row.nextAttemptAt && row.nextAttemptAt > now) return false;
      row.attemptStartedAt = now;
      row.attempts += 1;
      return true;
    }),
    markRequested: vi.fn(async (id: string, providerRefundId: string | null) => {
      const row = rows.get(id)!;
      if (row.state !== "pending" && row.state !== "failed") return false;
      Object.assign(row, {
        state: "requested",
        requestedAt: NOW.toISOString(),
        providerRefundId,
        attemptStartedAt: null,
        lastErrorCode: null,
      });
      return true;
    }),
    markSucceeded: vi.fn(async (id: string) => {
      const row = rows.get(id)!;
      if (row.state === "succeeded") return false;
      Object.assign(row, { state: "succeeded", succeededAt: NOW.toISOString() });
      return true;
    }),
    markFailed: vi.fn(async (id: string, code: string, nextAttemptAt: string) => {
      const row = rows.get(id)!;
      Object.assign(row, {
        state: "failed",
        lastErrorCode: code,
        nextAttemptAt,
        attemptStartedAt: null,
      });
      return true;
    }),
    markChecked: vi.fn(async (id: string, now: string) => {
      rows.get(id)!.checkedAt = now;
    }),
    dueForAttempt: vi.fn(async (now: string) =>
      [...rows.values()].filter(
        (r) =>
          (r.state === "pending" || r.state === "failed") &&
          (!r.nextAttemptAt || r.nextAttemptAt <= now),
      ),
    ),
    dueForCheck: vi.fn(async (checkedBefore: string) =>
      [...rows.values()].filter(
        (r) => r.state === "requested" && (r.checkedAt ?? r.requestedAt ?? "") <= checkedBefore,
      ),
    ),
    confirmByProviderCharge: vi.fn(async () => "unmatched" as const),
    refundOrphanCardCharge: vi.fn(async () => null),
  };
  return ops;
}

function abacate(overrides: Partial<AbacatePayRefundGateway> = {}): AbacatePayRefundGateway {
  return {
    refundCharge: vi.fn(async ({ id }) => ({ id, status: "REFUNDED", alreadyRefunded: false })),
    checkPixCharge: vi.fn(async () => ({ status: "REFUNDED", expiresAt: null })),
    getCardCharge: vi.fn(async (id: string) => ({
      id,
      status: "REFUNDED",
      amountCents: 5_330,
      brand: null,
      lastFour: null,
      platformFeeCents: null,
      devMode: true,
      metadata: {},
    })),
    ...overrides,
  };
}

function efi(status = "paid", overrides: Partial<EfiRefundGateway> = {}): EfiRefundGateway {
  return {
    refundCardCharge: vi.fn(async () => undefined),
    cancelCharge: vi.fn(async () => undefined),
    getCharge: vi.fn(async (chargeId: number) => ({
      chargeId,
      status,
      totalCents: 5_330,
      customId: "intent-1",
      refusalReason: null,
      refusalRetry: null,
    })),
    ...overrides,
  };
}

function service(
  refunds: ReturnType<typeof fakeRefunds>,
  gateways: { abacatePay?: AbacatePayRefundGateway | null; efi?: EfiRefundGateway | null },
) {
  const incidents: RefundIncident[] = [];
  const svc = createRefundService({
    db: { refunds } as unknown as FoodeDb,
    gateways: { abacatePay: gateways.abacatePay ?? null, efi: gateways.efi ?? null },
    now: () => NOW,
    report: (incident) => incidents.push(incident),
  });
  return { svc, incidents };
}

describe("PIX e Cartão Rápido → AbacatePay (total, inclusive a tarifa)", () => {
  it("estorna a cobrança gravada; REFUNDED na resposta = concluído", async () => {
    const refunds = fakeRefunds([refund()]);
    const gateway = abacate();
    const { svc } = service(refunds, { abacatePay: gateway, efi: efi() });
    const after = await svc.execute("refund-1");
    expect(gateway.refundCharge).toHaveBeenCalledWith({
      id: "pix_char_TESTE01",
      reason: "Pedido cancelado pela Loja",
    });
    expect(after?.state).toBe("succeeded");
  });

  it("aceito sem status final = em andamento (o webhook conclui); já estornado = concluído", async () => {
    const refunds = fakeRefunds([
      refund(),
      refund({ refundId: "refund-2", intentId: "intent-2", method: "credit", cardMode: "rapido" }),
    ]);
    const gateway = abacate({
      refundCharge: vi
        .fn()
        .mockResolvedValueOnce({ id: "rf_1", status: null, alreadyRefunded: false })
        .mockResolvedValueOnce({ id: "x", status: "REFUNDED", alreadyRefunded: true }),
    });
    const { svc } = service(refunds, { abacatePay: gateway });
    expect((await svc.execute("refund-1"))?.state).toBe("requested");
    expect(refunds.rows.get("refund-1")?.providerRefundId).toBe("rf_1");
    expect((await svc.execute("refund-2"))?.state).toBe("succeeded");
  });

  it("falha do provedor: failed com backoff, Sentry só com campos seguros, sem nova chamada no backoff", async () => {
    const refunds = fakeRefunds([refund()]);
    const gateway = abacate({
      refundCharge: vi.fn(async () => {
        throw new AbacatePayError({
          kind: "insufficient_funds",
          status: 400,
          code: "INSUFFICIENT_FUNDS",
          endpoint: "POST /transparents/refund",
        });
      }),
    });
    const { svc, incidents } = service(refunds, { abacatePay: gateway });
    const after = await svc.execute("refund-1");
    expect(after).toMatchObject({
      state: "failed",
      attempts: 1,
      lastErrorCode: "insufficient_funds:INSUFFICIENT_FUNDS",
      nextAttemptAt: new Date(NOW.getTime() + REFUND_RETRY_BASE_MS).toISOString(),
    });
    expect(incidents).toEqual([
      {
        message: "refund_failed",
        provider: "abacatepay",
        code: "insufficient_funds:INSUFFICIENT_FUNDS",
        attempts: 1,
      },
    ]);
    expect(JSON.stringify(incidents)).not.toContain("pix_char");
    // Dentro do backoff: nenhuma chamada nova.
    await svc.execute("refund-1");
    expect(gateway.refundCharge).toHaveBeenCalledTimes(1);
  });

  it("sem chave da AbacatePay: falha retentável e observável", async () => {
    const refunds = fakeRefunds([refund()]);
    const { svc, incidents } = service(refunds, {});
    expect((await svc.execute("refund-1"))?.lastErrorCode).toBe("abacatepay_unavailable");
    expect(incidents[0]?.code).toBe("abacatepay_unavailable");
  });
});

describe("Cartão Normal → Efí", () => {
  const efiRefund = refund({
    provider: "efi",
    method: "credit",
    cardMode: "normal",
    providerChargeId: "900001",
  });

  it("1ª tentativa estorna o total (sem valor) e fica em andamento até a notificação", async () => {
    const refunds = fakeRefunds([efiRefund]);
    const gateway = efi();
    const { svc } = service(refunds, { efi: gateway, abacatePay: abacate() });
    expect((await svc.execute("refund-1"))?.state).toBe("requested");
    expect(gateway.refundCardCharge).toHaveBeenCalledWith(900001);
    expect(gateway.getCharge).not.toHaveBeenCalled();
  });

  it("retentativa confere antes: já `refunded` = concluído sem estornar de novo", async () => {
    const refunds = fakeRefunds([{ ...efiRefund, state: "failed", attempts: 1 }]);
    const gateway = efi("refunded");
    const { svc } = service(refunds, { efi: gateway });
    expect((await svc.execute("refund-1"))?.state).toBe("succeeded");
    expect(gateway.refundCardCharge).not.toHaveBeenCalled();
  });

  it("recusado por estado e ainda sem captura: cancela a cobrança", async () => {
    const refunds = fakeRefunds([efiRefund]);
    const gateway = efi("waiting", {
      refundCardCharge: vi.fn(async () => {
        throw new EfiError({
          kind: "invalid_state",
          status: 400,
          code: "invalid_state",
          endpoint: "/v1/charge/card/:id/refund",
        });
      }),
    });
    const { svc } = service(refunds, { efi: gateway });
    expect((await svc.execute("refund-1"))?.state).toBe("succeeded");
    expect(gateway.cancelCharge).toHaveBeenCalledWith(900001);
  });

  it("cobrança gravada inválida nunca chega à Efí", async () => {
    const refunds = fakeRefunds([{ ...efiRefund, providerChargeId: "abc" }]);
    const gateway = efi();
    const { svc } = service(refunds, { efi: gateway });
    expect((await svc.execute("refund-1"))?.lastErrorCode).toBe("invalid_charge");
    expect(gateway.refundCardCharge).not.toHaveBeenCalled();
  });
});

describe("idempotência e retentativa automática", () => {
  it("concluído ou já em andamento não chama o provedor; lease ocupado também não", async () => {
    const refunds = fakeRefunds([
      refund({ state: "succeeded", succeededAt: NOW.toISOString() }),
      refund({ refundId: "refund-2", intentId: "intent-2", state: "requested" }),
      refund({
        refundId: "refund-3",
        intentId: "intent-3",
        attemptStartedAt: new Date(NOW.getTime() - 1_000).toISOString(),
      }),
    ]);
    const gateway = abacate();
    const { svc } = service(refunds, { abacatePay: gateway });
    await svc.execute("refund-1");
    await svc.execute("refund-2");
    await svc.execute("refund-3");
    expect(gateway.refundCharge).not.toHaveBeenCalled();
    expect(await svc.execute("nao-existe")).toBeNull();
  });

  it("retryPendingRefunds: tenta os vencidos, confere os aceitos sem webhook", async () => {
    const old = new Date(NOW.getTime() - REFUND_CHECK_INTERVAL_MS - 1).toISOString();
    const refunds = fakeRefunds([
      refund({ state: "failed", attempts: 2, nextAttemptAt: old }),
      refund({ refundId: "refund-2", intentId: "intent-2", state: "requested", requestedAt: old }),
      refund({
        refundId: "refund-3",
        intentId: "intent-3",
        state: "failed",
        nextAttemptAt: new Date(NOW.getTime() + 60_000).toISOString(),
      }),
    ]);
    const gateway = abacate();
    const { svc } = service(refunds, { abacatePay: gateway });
    await expect(svc.retryPendingRefunds(NOW)).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      requested: 0,
      failed: 0,
      confirmed: 1,
    });
    expect(refunds.rows.get("refund-3")?.state).toBe("failed");
    expect(gateway.checkPixCharge).toHaveBeenCalledWith("pix_char_TESTE01");
  });

  it("consulta que falha não interrompe a rodada e é observável", async () => {
    const old = new Date(NOW.getTime() - REFUND_CHECK_INTERVAL_MS - 1).toISOString();
    const refunds = fakeRefunds([
      refund({ state: "requested", requestedAt: old, method: "credit", cardMode: "rapido" }),
      refund({
        refundId: "refund-2",
        intentId: "intent-2",
        state: "requested",
        requestedAt: old,
        provider: "efi",
        method: "credit",
        cardMode: "normal",
        providerChargeId: "900002",
      }),
    ]);
    const { svc, incidents } = service(refunds, {
      abacatePay: abacate({
        getCardCharge: vi.fn(async () => {
          throw new TypeError("rede");
        }),
      }),
      efi: efi("refunded"),
    });
    const summary = await svc.retryPendingRefunds(NOW);
    expect(summary.confirmed).toBe(1);
    expect(incidents).toEqual([
      { message: "refund_check_failed", provider: "abacatepay", code: "TypeError" },
    ]);
  });

  it("pagamento tardio e cobrança órfã executam a obrigação gravada", async () => {
    const refunds = fakeRefunds([refund()]);
    refunds.refundOrphanCardCharge.mockResolvedValueOnce(null);
    const gateway = abacate();
    const { svc } = service(refunds, { abacatePay: gateway });
    await svc.afterPayment("intent-1");
    expect(refunds.rows.get("refund-1")?.state).toBe("succeeded");
    await svc.afterPayment("intent-sem-estorno");
    await svc.orphanCardCharge({ intentId: "intent-9", providerChargeId: "card_9" });
    expect(gateway.refundCharge).toHaveBeenCalledTimes(1);
  });

  it("webhook de Estorno sem obrigação = unmatched e observável", async () => {
    const refunds = fakeRefunds([]);
    const { svc, incidents } = service(refunds, {});
    await expect(
      svc.confirmFromWebhook({
        providerChargeId: "pix_char_x",
        event: {
          provider: "abacatepay",
          eventId: "log_1",
          eventType: "transparent.refunded",
          devMode: true,
        },
      }),
    ).resolves.toBe("unmatched");
    expect(incidents).toEqual([
      { message: "refund_webhook_unmatched", provider: "abacatepay", code: "transparent.refunded" },
    ]);
  });
});

describe("configuração", () => {
  it("clientes só com as chaves de cada provedor", () => {
    expect(refundGatewaysFromEnv({})).toEqual({ abacatePay: null, efi: null });
    const both = refundGatewaysFromEnv({
      ABACATEPAY_API_KEY: "abc",
      EFI_CLIENT_ID: "id",
      EFI_CLIENT_SECRET: "segredo",
      EFI_ENVIRONMENT: "sandbox",
    });
    expect(both.abacatePay).not.toBeNull();
    expect(both.efi).not.toBeNull();
    expect(refundErrorCode("x")).toBe("unknown");
  });
});
