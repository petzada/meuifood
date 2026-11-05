// Regras do PIX AbacatePay sem banco (Ticket 26): o provedor é o cliente real com `fetch` fake no
// limite HTTP (fixtures sanitizadas) e o `db.payments` é um dublê que registra as chamadas. A
// deduplicação e a ausência de regressão no banco ficam em pix.d1.test.ts (CI).
import type { FoodeDb, PixIntentView } from "@foode/db";
import { describe, expect, it, vi } from "vitest";

import {
  abacatePayFromEnv,
  createPixService,
  PIX_CREATE_GIVE_UP_MS,
  toOrderPix,
} from "./pix-service";
import pixCreate from "./providers/abacatepay/__fixtures__/pix-create.json";
import completedCard from "./providers/abacatepay/__fixtures__/webhook-transparent-completed-card.json";
import completedPix from "./providers/abacatepay/__fixtures__/webhook-transparent-completed-pix.json";
import refunded from "./providers/abacatepay/__fixtures__/webhook-transparent-refunded.json";
import transferIgnored from "./providers/abacatepay/__fixtures__/webhook-transfer-ignored.json";
import { signAbacatePayBody } from "./providers/abacatepay/webhook";

const ENV = {
  ABACATEPAY_API_KEY: "abc_teste",
  ABACATEPAY_WEBHOOK_SECRET: "segredo-webhook-teste",
  ABACATEPAY_SIGNING_KEY: "chave-publica-teste",
};
const NOW = new Date("2026-11-06T15:00:00.000Z"); // sexta, 12h em São Paulo

function intent(overrides: Partial<PixIntentView> = {}): PixIntentView {
  return {
    intentId: "intent_teste_001",
    storeId: "store-a",
    orderId: "order-a",
    state: "pending",
    amountCents: 5990,
    serviceFeeCents: 150,
    providerChargeId: "pix_char_TESTE000000000000000001",
    copyPaste: "000201...",
    qrCode: "data:image/png;base64,iVBORw0KGgo=",
    expiresAt: "2026-11-06T15:30:00.000Z",
    attemptStartedAt: null,
    checkedAt: null,
    paidAt: null,
    providerFeeCents: null,
    foodeFee: { feeId: "fee-pix", percentBps: 99, fixedCents: 0 },
    createdAt: "2026-11-06T14:59:00.000Z",
    orderStatus: "received",
    ...overrides,
  };
}

function fakePayments(current: PixIntentView | null = intent()) {
  return {
    pixIntentOfOrder: vi.fn(async () => current),
    intentById: vi.fn(async () => current),
    intentByProviderCharge: vi.fn(async () => current),
    claimChargeAttempt: vi.fn(async () => true),
    recordPixCharge: vi.fn(async () => true),
    failChargeAttempt: vi.fn(async () => undefined),
    markChecked: vi.fn(async () => undefined),
    expirePix: vi.fn(async () => true),
    webhookEventSeen: vi.fn(async () => false),
    recordWebhookEvent: vi.fn(async () => undefined),
    confirmPayment: vi.fn(async () => "applied" as const),
    providerCostAt: vi.fn(async () => null),
    ledgerOfIntent: vi.fn(async () => []),
  };
}

type Payments = ReturnType<typeof fakePayments>;

function service(
  payments: Payments,
  fetch?: (url: string, init: RequestInit) => Promise<Response>,
) {
  const db = { payments } as unknown as FoodeDb;
  return createPixService({
    db,
    provider: abacatePayFromEnv(ENV, fetch ?? (async () => Response.json({}))),
    now: () => NOW,
  });
}

async function signed(body: unknown, secret = ENV.ABACATEPAY_WEBHOOK_SECRET) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    rawBody,
    querySecret: secret,
    signature: await signAbacatePayBody(rawBody, ENV.ABACATEPAY_SIGNING_KEY),
  };
}

describe("configuração", () => {
  it("sem qualquer uma das três chaves o PIX fica indisponível", () => {
    expect(abacatePayFromEnv({})).toBeNull();
    expect(abacatePayFromEnv({ ...ENV, ABACATEPAY_SIGNING_KEY: " " })).toBeNull();
    expect(abacatePayFromEnv({ ABACATEPAY_API_KEY: "a", ABACATEPAY_SIGNING_KEY: "b" })).toBeNull();
    expect(abacatePayFromEnv(ENV)).not.toBeNull();
    const payments = fakePayments();
    expect(
      createPixService({ db: { payments } as unknown as FoodeDb, provider: null }).available(),
    ).toBe(false);
    expect(service(payments).available()).toBe(true);
  });

  it("resposta pública só mostra QR e copia-e-cola enquanto aguarda pagamento", () => {
    expect(toOrderPix(intent())).toEqual({
      state: "pending",
      amountCents: 5990,
      copyPaste: "000201...",
      qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      expiresAt: "2026-11-06T15:30:00.000Z",
    });
    expect(toOrderPix(intent({ state: "paid" }))).toMatchObject({
      copyPaste: null,
      qrCodeDataUrl: null,
      expiresAt: null,
    });
    expect(toOrderPix(intent({ state: "expired" }))).toMatchObject({ copyPaste: null });
    expect(toOrderPix(intent({ qrCode: "javascript:alert(1)" })).qrCodeDataUrl).toBeNull();
  });
});

describe("criação da cobrança (idempotência nossa)", () => {
  it("cria com intentId em metadata e grava QR, copia-e-cola e expiração", async () => {
    const payments = fakePayments(intent({ state: "creating", providerChargeId: null }));
    const fetch = vi.fn(async () => Response.json(pixCreate));
    await service(payments, fetch).ensureChargeForOrder("order-a");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.abacatepay.com/v2/transparents/create");
    const body = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
    expect(body).toMatchObject({
      method: "PIX",
      data: { amount: 5990, expiresIn: 1800, metadata: { intentId: "intent_teste_001" } },
    });
    expect(payments.recordPixCharge).toHaveBeenCalledWith({
      intentId: "intent_teste_001",
      providerChargeId: "pix_char_TESTE000000000000000001",
      copyPaste: pixCreate.data.brCode,
      qrCode: pixCreate.data.brCodeBase64,
      expiresAt: "2026-11-04T15:30:00.000Z",
      providerFeeCents: 54,
      devMode: true,
    });
  });

  it("sem lease (outra chamada em andamento) ou com cobrança já gravada não chama o provedor", async () => {
    const fetch = vi.fn(async () => Response.json(pixCreate));
    const busy = fakePayments(intent({ state: "creating", providerChargeId: null }));
    busy.claimChargeAttempt.mockResolvedValue(false);
    await service(busy, fetch).ensureChargeForOrder("order-a");
    await service(fakePayments(intent()), fetch).ensureChargeForOrder("order-a");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("timeout não é recusa: fica `creating` para tentar de novo depois do lease", async () => {
    const payments = fakePayments(intent({ state: "creating", providerChargeId: null }));
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    await service(payments, async () => Promise.reject(timeout)).ensureChargeForOrder("order-a");
    expect(payments.failChargeAttempt).not.toHaveBeenCalled();
    expect(payments.recordPixCharge).not.toHaveBeenCalled();
  });

  it("erro definitivo (chave inválida) ou valor diferente marca `failed`", async () => {
    const payments = fakePayments(intent({ state: "creating", providerChargeId: null }));
    await service(payments, async () =>
      Response.json({ data: null, error: "Unauthorized", success: false }, { status: 401 }),
    ).ensureChargeForOrder("order-a");
    expect(payments.failChargeAttempt).toHaveBeenCalledWith(
      "intent_teste_001",
      expect.stringMatching(/^unauthorized:/u),
    );

    const mismatch = fakePayments(
      intent({ state: "creating", providerChargeId: null, amountCents: 100 }),
    );
    await service(mismatch, async () => Response.json(pixCreate)).ensureChargeForOrder("order-a");
    expect(mismatch.failChargeAttempt).toHaveBeenCalledWith("intent_teste_001", "amount_mismatch");
    expect(mismatch.recordPixCharge).not.toHaveBeenCalled();
  });

  it("desiste depois de 10 min sem conseguir criar", async () => {
    const old = new Date(NOW.getTime() - PIX_CREATE_GIVE_UP_MS - 1).toISOString();
    const payments = fakePayments(
      intent({ state: "creating", providerChargeId: null, createdAt: old }),
    );
    await service(payments).ensureChargeForOrder("order-a");
    expect(payments.failChargeAttempt).toHaveBeenCalledWith("intent_teste_001", "give_up");
  });
});

describe("página do Pedido: expiração e reconciliação", () => {
  it("QR vencido no relógio: consulta o provedor e expira", async () => {
    const payments = fakePayments(intent({ expiresAt: "2026-11-06T14:59:59.000Z" }));
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({ data: { status: "EXPIRED" }, error: null, success: true }),
    );
    await service(payments, fetch).viewForOrder("order-a");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/transparents/check?id=pix_char_");
    expect(payments.expirePix).toHaveBeenCalledWith("intent_teste_001");
  });

  it("consulta periódica PAID confirma com o Ledger calculado (custo pela tabela do Ops)", async () => {
    const payments = fakePayments(intent({ checkedAt: "2026-11-06T14:50:00.000Z" }));
    payments.providerCostAt.mockResolvedValue({ percentBps: 0, fixedCents: 54 } as never);
    const fetch = vi.fn(async () =>
      Response.json({ data: { status: "PAID" }, error: null, success: true }),
    );
    await service(payments, fetch).viewForOrder("order-a");
    expect(payments.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: "intent_teste_001",
        amountCents: 5990,
        event: null,
        ledger: {
          chargedCents: 5990,
          orderTotalCents: 5840,
          serviceFeeCents: 150,
          foodeFeeCents: 58,
          providerCostCents: 54,
          netCents: 5782,
          releaseDate: "2026-11-06",
          expectedPayoutDate: "2026-11-09",
        },
      }),
    );
  });

  it("consultou há menos de 60 s: não chama o provedor de novo", async () => {
    const payments = fakePayments(intent({ checkedAt: "2026-11-06T14:59:30.000Z" }));
    const fetch = vi.fn(async () => Response.json({}));
    const view = await service(payments, fetch).viewForOrder("order-a");
    expect(fetch).not.toHaveBeenCalled();
    expect(view?.state).toBe("pending");
  });
});

describe("webhook", () => {
  it("sem chaves = 503; segredo ou assinatura errados = 401, sem tocar o banco", async () => {
    const payments = fakePayments();
    const unavailable = createPixService({
      db: { payments } as unknown as FoodeDb,
      provider: null,
    });
    await expect(unavailable.handleWebhook(await signed(completedPix))).resolves.toMatchObject({
      status: 503,
    });
    const pix = service(payments);
    await expect(pix.handleWebhook(await signed(completedPix, "errado"))).resolves.toEqual({
      status: 401,
      body: { error: "unauthorized" },
    });
    const good = await signed(completedPix);
    await expect(
      pix.handleWebhook({ ...good, rawBody: good.rawBody.replace("5990", "1") }),
    ).resolves.toMatchObject({ status: 401 });
    await expect(pix.handleWebhook({ ...good, querySecret: null })).resolves.toMatchObject({
      status: 401,
    });
    expect(payments.webhookEventSeen).not.toHaveBeenCalled();
    expect(payments.confirmPayment).not.toHaveBeenCalled();
  });

  it("payload ilegível assinado = 400; evento fora do escopo = 200 ignorado", async () => {
    const payments = fakePayments();
    const pix = service(payments);
    await expect(pix.handleWebhook(await signed("não é json"))).resolves.toMatchObject({
      status: 400,
    });
    await expect(pix.handleWebhook(await signed(transferIgnored))).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "ignored" },
    });
  });

  it("PIX pago: confirma com custo informado pelo provedor e Ledger D+1 útil", async () => {
    const payments = fakePayments();
    const reply = await service(payments).handleWebhook(await signed(completedPix));
    expect(reply).toEqual({ status: 200, body: { ok: true, outcome: "applied" } });
    expect(payments.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerChargeId: "pix_char_TESTE000000000000000001",
        amountCents: 5990,
        providerFeeCents: 54,
        event: {
          provider: "abacatepay",
          eventId: "log_TESTE000000000000000001",
          eventType: "transparent.completed",
          devMode: true,
        },
        ledger: expect.objectContaining({ providerCostCents: 54, netCents: 5782 }),
      }),
    );
  });

  it("reentrega/duplicata: responde 200 sem reprocessar", async () => {
    const payments = fakePayments();
    payments.webhookEventSeen.mockResolvedValue(true);
    await expect(service(payments).handleWebhook(await signed(completedPix))).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "duplicate" },
    });
    expect(payments.confirmPayment).not.toHaveBeenCalled();
  });

  it("outro evento já confirmou (fora de ordem): registra `already_applied`", async () => {
    const payments = fakePayments();
    payments.confirmPayment.mockResolvedValue("already_applied" as never);
    await expect(service(payments).handleWebhook(await signed(completedPix))).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "already_applied" },
    });
    expect(payments.recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "already_applied", intentId: "intent_teste_001" }),
    );
  });

  it("cartão e estorno ficam registrados para os Tickets 27/12, sem efeito", async () => {
    const payments = fakePayments();
    const pix = service(payments);
    for (const body of [completedCard, refunded]) {
      await expect(pix.handleWebhook(await signed(body))).resolves.toMatchObject({
        status: 200,
        body: { outcome: "deferred" },
      });
    }
    expect(payments.confirmPayment).not.toHaveBeenCalled();
  });

  it("cobrança desconhecida ou valor diferente: registra e não confirma", async () => {
    const unknown = fakePayments(null);
    await expect(service(unknown).handleWebhook(await signed(completedPix))).resolves.toMatchObject(
      {
        body: { outcome: "unmatched" },
      },
    );
    const other = fakePayments(intent({ amountCents: 1000 }));
    await expect(service(other).handleWebhook(await signed(completedPix))).resolves.toMatchObject({
      body: { outcome: "amount_mismatch" },
    });
    expect(other.confirmPayment).not.toHaveBeenCalled();
    // intentId do metadata apontando para intenção com OUTRA cobrança: não casa.
    const foreign = fakePayments(intent({ providerChargeId: "pix_char_OUTRA" }));
    foreign.intentByProviderCharge.mockResolvedValue(null);
    await expect(service(foreign).handleWebhook(await signed(completedPix))).resolves.toMatchObject(
      {
        body: { outcome: "unmatched" },
      },
    );
  });
});

describe("Ticket 12: Estorno e PIX vencido", () => {
  function withRefunds(payments: Payments) {
    const refunds = {
      afterPayment: vi.fn(async () => undefined),
      confirmFromWebhook: vi.fn(async () => "applied" as const),
    };
    const dbRefunds = {
      cancelExpiredPix: vi.fn(async () => true),
      expirablePix: vi.fn(async () => []),
    };
    const pix = createPixService({
      db: { payments, refunds: dbRefunds } as unknown as FoodeDb,
      provider: abacatePayFromEnv(ENV, async () =>
        Response.json({ data: { status: "EXPIRED" }, error: null, success: true }),
      ),
      refunds,
      now: () => NOW,
    });
    return { pix, refunds, dbRefunds };
  }

  it("`transparent.refunded` conclui o Estorno pela cobrança, sem tocar o pagamento", async () => {
    const payments = fakePayments();
    const { pix, refunds } = withRefunds(payments);
    await expect(pix.handleWebhook(await signed(refunded))).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "applied" },
    });
    expect(refunds.confirmFromWebhook).toHaveBeenCalledWith({
      providerChargeId: "pix_char_TESTE000000000000000001",
      event: {
        provider: "abacatepay",
        eventId: "log_TESTE000000000000000003",
        eventType: "transparent.refunded",
        devMode: true,
      },
    });
    expect(payments.confirmPayment).not.toHaveBeenCalled();
  });

  it("pagamento confirmado dispara o Estorno tardio (se o Pedido já estiver cancelado)", async () => {
    const payments = fakePayments();
    const { pix, refunds } = withRefunds(payments);
    await pix.handleWebhook(await signed(completedPix));
    expect(refunds.afterPayment).toHaveBeenCalledWith("intent_teste_001");
  });

  it("QR vencido na página: expira e cancela o Pedido (`pix_expired`)", async () => {
    const payments = fakePayments(intent({ expiresAt: "2026-11-06T14:59:59.000Z" }));
    const { pix, dbRefunds } = withRefunds(payments);
    await pix.viewForOrder("order-a");
    expect(dbRefunds.cancelExpiredPix).toHaveBeenCalledWith({
      intentId: "intent_teste_001",
      orderId: "order-a",
      storeId: "store-a",
    });
  });

  it("varredura: pago de fato confirma; vencido cancela; provedor fora adia na carência", async () => {
    const base = { storeId: "store-a", orderId: "order-a", expiresAt: "2026-11-06T14:50:00.000Z" };
    const candidates = [
      { ...base, intentId: "i-paid", state: "pending", providerChargeId: "pix_char_PAGO" },
      { ...base, intentId: "i-exp", state: "pending", providerChargeId: "pix_char_VENCIDO" },
      { ...base, intentId: "i-down", state: "pending", providerChargeId: "pix_char_FORA" },
      { ...base, intentId: "i-fail", state: "failed", providerChargeId: null },
    ];
    const payments = fakePayments();
    const dbRefunds = {
      expirablePix: vi.fn(async () => candidates),
      cancelExpiredPix: vi.fn<(target: { intentId: string }) => Promise<boolean>>(async () => true),
    };
    const pix = createPixService({
      db: { payments, refunds: dbRefunds } as unknown as FoodeDb,
      provider: abacatePayFromEnv(ENV, async (url) => {
        if (url.includes("pix_char_FORA")) return new Response("x", { status: 503 });
        const status = url.includes("pix_char_PAGO") ? "PAID" : "EXPIRED";
        return Response.json({ data: { status }, error: null, success: true });
      }),
      now: () => NOW,
    });
    await expect(pix.expireUnpaidPix(NOW)).resolves.toEqual({ cancelled: 2, paid: 1, skipped: 1 });
    expect(payments.confirmPayment).toHaveBeenCalledTimes(1);
    expect(dbRefunds.cancelExpiredPix.mock.calls.map((call) => call[0].intentId)).toEqual([
      "i-exp",
      "i-fail",
    ]);
    // Depois da carência, provedor fora não segura mais o cancelamento.
    dbRefunds.expirablePix.mockResolvedValueOnce([candidates[2]!]);
    const later = new Date(NOW.getTime() + 60 * 60_000);
    await expect(pix.expireUnpaidPix(later)).resolves.toEqual({
      cancelled: 1,
      paid: 0,
      skipped: 0,
    });
  });
});
