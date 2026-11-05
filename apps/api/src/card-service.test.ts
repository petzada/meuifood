// Regras do Cartão sem banco (Ticket 27): adapters fakes dos dois provedores (Efí one-step e
// AbacatePay transparente) e `db.cardPayments` como dublê que registra as chamadas. Prova:
// aprovado/pendente/recusado distintos, só a confirmação canônica confirma, uma chamada por
// tentativa (token de uso único), Ledger com prazo do modo, notificação da Efí autenticada pelo
// `?secret=`, webhook de CARD da AbacatePay roteado pelo PIX e nada de dado pessoal em log.
// Idempotência real, fora de ordem e isolamento no D1 ficam em card.d1.test.ts (CI).
import type { CardIntentView, FoodeDb } from "@foode/db";
import { orderCardSchema, type CardPaymentInput } from "@foode/shared/payment";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AbacatePayCardGateway,
  CARD_PROCESSING_GIVE_UP_MS,
  createCardService,
  declineReasonOfError,
  type EfiCardGateway,
  nationalPhone,
  toOrderCard,
} from "./card-service";
import { createPixService } from "./pix-service";
import { AbacatePayError } from "./providers/abacatepay/errors";
import { signAbacatePayBody } from "./providers/abacatepay/webhook";
import { EfiError } from "./providers/efi/client";
import { parseEfiNotificationEvents } from "./providers/efi/notification";
import notification from "./providers/efi/__fixtures__/notification.json";

// Quinta, 05/11/2026, 12h em São Paulo.
const NOW = new Date("2026-11-05T15:00:00.000Z");
const CPF = "52998224725";
const SECRET = "segredo-notificacao-teste";
const EFI_TOKEN = "efi-token-0001";

const efiCard: CardPaymentInput = {
  sdk: "efi",
  paymentToken: "a1b2c3d4e5f6a7b8c9d0",
  payer: { cpf: CPF, email: "ana@exemplo.com", birthDate: "1990-05-17" },
  brand: "visa",
  lastFour: "4242",
};
const abacateCard: CardPaymentInput = {
  sdk: "abacatepay",
  token: "ctok_teste_123456",
  payer: { cpf: CPF, email: "ana@exemplo.com" },
  brand: "mastercard",
  lastFour: "5454",
};

function intent(overrides: Partial<CardIntentView> = {}): CardIntentView {
  return {
    intentId: "intent_teste_003",
    storeId: "store-a",
    orderId: "order-a",
    attemptKey: "11111111-1111-4111-8111-111111111111",
    provider: "efi",
    cardMode: "normal",
    intentState: "creating",
    state: "processing",
    declineReason: null,
    amountCents: 5990,
    serviceFeeCents: 150,
    providerChargeId: null,
    providerStatus: null,
    brand: "visa",
    lastFour: "4242",
    efiNotificationToken: null,
    efiLastEventId: null,
    providerFeeCents: null,
    approvedAt: null,
    expectedReleaseDate: null,
    releaseSource: null,
    foodeFee: { feeId: "fee-normal", percentBps: 349, fixedCents: 99 },
    attemptStartedAt: null,
    checkedAt: null,
    createdAt: "2026-11-05T14:59:00.000Z",
    orderStatus: "received",
    orderCode: 7,
    customerName: "Ana Souza",
    customerPhoneE164: "+5511912345678",
    ...overrides,
  };
}

function fakeDb(current: CardIntentView | null) {
  const cardPayments = {
    latestOfOrder: vi.fn(async () => current),
    byIntentId: vi.fn(async () => current),
    byAttempt: vi.fn(async () => null),
    byProviderCharge: vi.fn(async () => current),
    byEfiNotificationToken: vi.fn(async () => null),
    claimChargeAttempt: vi.fn(async () => true),
    recordCharge: vi.fn(async () => true),
    decline: vi.fn(async () => true),
    advanceEfiEvents: vi.fn(async () => true),
    markChecked: vi.fn(async () => undefined),
    confirm: vi.fn(async () => "applied" as const),
    createAttempt: vi.fn(),
  };
  const payments = {
    recordWebhookEvent: vi.fn(async () => undefined),
    webhookEventSeen: vi.fn(async () => false),
    providerCostAt: vi.fn(async () => ({ percentBps: 349, fixedCents: 0 })),
  };
  return { cardPayments, payments, db: { cardPayments, payments } as unknown as FoodeDb };
}

function efiGateway(overrides: Partial<EfiCardGateway> = {}): EfiCardGateway {
  return {
    createCardCharge: vi.fn(async (input) => ({
      chargeId: 900001,
      status: "approved",
      totalCents: input.amountCents,
      customId: input.customId,
      refusalReason: null,
      refusalRetry: null,
    })),
    getCharge: vi.fn(async (chargeId) => ({
      chargeId,
      status: "waiting",
      totalCents: 5990,
      customId: null,
      refusalReason: null,
      refusalRetry: null,
    })),
    getNotification: vi.fn(async () => parseEfiNotificationEvents(notification.data)),
    ...overrides,
  };
}

function abacateGateway(overrides: Partial<AbacatePayCardGateway> = {}): AbacatePayCardGateway {
  return {
    createCardCharge: vi.fn(async (input) => ({
      id: "card_TESTE000000000000000001",
      status: "APPROVED",
      amountCents: input.amountCents,
      brand: "mastercard",
      lastFour: "5454",
      platformFeeCents: 385,
      devMode: true,
      metadata: { intentId: input.intentId },
    })),
    getCardCharge: vi.fn(async (id) => ({
      id,
      status: "PENDING",
      amountCents: 5990,
      brand: null,
      lastFour: null,
      platformFeeCents: null,
      devMode: true,
      metadata: {},
    })),
    ...overrides,
  };
}

function service(db: FoodeDb, efi = efiGateway(), abacate = abacateGateway(), now = NOW) {
  return createCardService({
    db,
    efi: {
      gateway: efi,
      payeeCode: "0123456789abcdef0123456789abcdef",
      environment: "sandbox",
      notificationSecret: SECRET,
      notificationUrl: "https://api.exemplo.test/webhooks/efi",
    },
    abacatePay: { gateway: abacate, publicKey: "pk_dev_publica" },
    now: () => now,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Normal (Efí one-step)", () => {
  it("aprovado: uma chamada, pagador completo, notification_url com segredo e Ledger em 21 dias úteis", async () => {
    const { db, cardPayments } = fakeDb(intent());
    const efi = efiGateway();
    await service(db, efi).chargeForOrder("order-a", efiCard, CPF);
    expect(efi.createCardCharge).toHaveBeenCalledTimes(1);
    expect(efi.createCardCharge).toHaveBeenCalledWith({
      customId: "intent_teste_003",
      amountCents: 5990,
      itemName: "Pedido #7",
      paymentToken: efiCard.paymentToken,
      customer: {
        name: "Ana Souza",
        cpf: CPF,
        email: "ana@exemplo.com",
        phoneNumber: "11912345678",
        birth: "1990-05-17",
      },
      notificationUrl: `https://api.exemplo.test/webhooks/efi?secret=${SECRET}`,
    });
    expect(cardPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: "intent_teste_003",
        providerChargeId: "900001",
        amountCents: 5990,
        providerStatus: "approved",
        expectedReleaseDate: "2026-12-07",
        releaseSource: "max_term",
        retentions: [],
        event: null,
        ledger: expect.objectContaining({
          chargedCents: 5990,
          orderTotalCents: 5840,
          serviceFeeCents: 150,
          foodeFeeCents: 303,
          netCents: 5537,
          providerCostCents: 209,
          releaseDate: "2026-12-07",
          expectedPayoutDate: "2026-12-08",
        }),
      }),
    );
  });

  it("recusado (`unpaid`): declined com motivo exibível, sem confirmar", async () => {
    const { db, cardPayments } = fakeDb(intent());
    const efi = efiGateway({
      createCardCharge: vi.fn(async () => ({
        chargeId: 900002,
        status: "unpaid",
        totalCents: 5990,
        customId: null,
        refusalReason: "Transação não autorizada",
        refusalRetry: true,
      })),
    });
    await service(db, efi).chargeForOrder("order-a", efiCard, CPF);
    expect(cardPayments.decline).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "issuer_declined",
        providerChargeId: "900002",
        providerStatus: "unpaid",
      }),
    );
    expect(cardPayments.confirm).not.toHaveBeenCalled();
  });

  it("em análise (`waiting`): pendente", async () => {
    const { db, cardPayments } = fakeDb(intent());
    const efi = efiGateway({
      createCardCharge: vi.fn(async () => ({
        chargeId: 900003,
        status: "waiting",
        totalCents: 5990,
        customId: null,
        refusalReason: null,
        refusalRetry: null,
      })),
    });
    await service(db, efi).chargeForOrder("order-a", efiCard, CPF);
    expect(cardPayments.recordCharge).toHaveBeenCalledWith(
      expect.objectContaining({ providerChargeId: "900003", state: "pending" }),
    );
  });

  it("timeout = incerto: nada de recusa (aguarda a notificação ou o prazo); log sem dados", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, cardPayments } = fakeDb(intent());
    const efi = efiGateway({
      createCardCharge: vi.fn(async () => {
        throw new EfiError({
          kind: "timeout",
          status: 0,
          code: "TIMEOUT",
          endpoint: "POST /v1/charge/one-step",
          uncertain: true,
        });
      }),
    });
    await service(db, efi).chargeForOrder("order-a", efiCard, CPF);
    expect(cardPayments.decline).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of [CPF, efiCard.paymentToken, "ana@exemplo.com", "1990-05-17", SECRET]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("reserva negada (replay/concorrência) = nenhuma chamada ao provedor", async () => {
    const { db, cardPayments } = fakeDb(intent());
    cardPayments.claimChargeAttempt.mockResolvedValue(false);
    const efi = efiGateway();
    await service(db, efi).chargeForOrder("order-a", efiCard, CPF);
    expect(efi.createCardCharge).not.toHaveBeenCalled();
  });

  it("SDK diferente do provedor gravado: recusa sem chamar ninguém", async () => {
    const { db, cardPayments } = fakeDb(intent());
    const efi = efiGateway();
    const abacate = abacateGateway();
    await service(db, efi, abacate).chargeForOrder("order-a", abacateCard, CPF);
    expect(efi.createCardCharge).not.toHaveBeenCalled();
    expect(abacate.createCardCharge).not.toHaveBeenCalled();
    expect(cardPayments.decline).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "sdk_mismatch" }),
    );
  });
});

describe("Rápido (AbacatePay transparente)", () => {
  const rapido = () => intent({ provider: "abacatepay", cardMode: "rapido" });

  it("APPROVED: confirma com o custo informado e liberação em 1 dia útil", async () => {
    const { db, cardPayments } = fakeDb(rapido());
    const abacate = abacateGateway();
    await service(db, efiGateway(), abacate).chargeForOrder("order-a", abacateCard, CPF);
    expect(abacate.createCardCharge).toHaveBeenCalledWith({
      intentId: "intent_teste_003",
      amountCents: 5990,
      token: "ctok_teste_123456",
      customer: {
        name: "Ana Souza",
        email: "ana@exemplo.com",
        taxId: CPF,
        cellphone: "11912345678",
      },
    });
    expect(cardPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        providerChargeId: "card_TESTE000000000000000001",
        providerFeeCents: 385,
        expectedReleaseDate: "2026-11-06",
        ledger: expect.objectContaining({
          providerCostCents: 385,
          expectedPayoutDate: "2026-11-09",
        }),
      }),
    );
  });

  it("recusa do emissor (400) = issuer_declined; PENDING = pendente", async () => {
    const declined = fakeDb(rapido());
    await service(
      declined.db,
      efiGateway(),
      abacateGateway({
        createCardCharge: vi.fn(async () => {
          throw new AbacatePayError({
            kind: "card_declined",
            status: 400,
            code: "Não foi possível processar o pagamento com este cartão",
            endpoint: "POST /transparents/create",
          });
        }),
      }),
    ).chargeForOrder("order-a", abacateCard, CPF);
    expect(declined.cardPayments.decline).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "issuer_declined" }),
    );

    const pending = fakeDb(rapido());
    await service(
      pending.db,
      efiGateway(),
      abacateGateway({
        createCardCharge: vi.fn(async (input) => ({
          id: "card_PENDENTE",
          status: "PENDING",
          amountCents: input.amountCents,
          brand: null,
          lastFour: null,
          platformFeeCents: null,
          devMode: true,
          metadata: {},
        })),
      }),
    ).chargeForOrder("order-a", abacateCard, CPF);
    expect(pending.cardPayments.recordCharge).toHaveBeenCalledWith(
      expect.objectContaining({ providerChargeId: "card_PENDENTE", state: "pending" }),
    );
    expect(pending.cardPayments.confirm).not.toHaveBeenCalled();
  });

  it("valor diferente do da intenção nunca confirma", async () => {
    const { db, cardPayments } = fakeDb(rapido());
    await service(
      db,
      efiGateway(),
      abacateGateway({
        createCardCharge: vi.fn(async () => ({
          id: "card_X",
          status: "APPROVED",
          amountCents: 1,
          brand: null,
          lastFour: null,
          platformFeeCents: null,
          devMode: true,
          metadata: {},
        })),
      }),
    ).chargeForOrder("order-a", abacateCard, CPF);
    expect(cardPayments.confirm).not.toHaveBeenCalled();
  });
});

describe("notificação da Efí", () => {
  const post = (querySecret: string | null, rawBody = `notification=${EFI_TOKEN}`) => ({
    rawBody,
    contentType: "application/x-www-form-urlencoded",
    querySecret,
  });

  it("sem segredo certo = 401 sem consultar; corpo sem token = 400; sem Efí = 503", async () => {
    const { db } = fakeDb(intent());
    const efi = efiGateway();
    await expect(service(db, efi).handleEfiNotification(post("errado"))).resolves.toMatchObject({
      status: 401,
    });
    await expect(service(db, efi).handleEfiNotification(post(null))).resolves.toMatchObject({
      status: 401,
    });
    expect(efi.getNotification).not.toHaveBeenCalled();
    await expect(
      service(db, efi).handleEfiNotification(post(SECRET, "outra=coisa")),
    ).resolves.toMatchObject({ status: 400 });
    const off = createCardService({ db, efi: null, abacatePay: null });
    await expect(off.handleEfiNotification(post(SECRET))).resolves.toMatchObject({ status: 503 });
  });

  it("histórico fora de ordem: a aprovação confirma com a chave do evento; o resto é registrado", async () => {
    const { db, cardPayments, payments } = fakeDb(
      intent({ intentState: "pending", providerChargeId: "900001", state: "pending" }),
    );
    const reply = await service(db).handleEfiNotification(post(SECRET));
    expect(reply).toEqual({ status: 200, body: { ok: true, outcome: "applied" } });
    expect(cardPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        providerChargeId: "900001",
        providerStatus: "approved",
        event: {
          provider: "efi",
          eventId: "efi:900001:2",
          eventType: "charge:approved",
          devMode: true,
        },
      }),
    );
    const recorded = payments.recordWebhookEvent.mock.calls.map(
      (call) => (call as unknown as [{ eventId: string; outcome: string }])[0],
    );
    expect(recorded.map((e) => [e.eventId, e.outcome])).toEqual([
      ["efi:900001:1", "deferred"],
      ["efi:900001:3", "deferred"],
    ]);
    expect(cardPayments.advanceEfiEvents).toHaveBeenCalledWith("intent_teste_003", 3, EFI_TOKEN);
  });

  it("eventos já vistos: duplicata sem efeito", async () => {
    const { db, cardPayments } = fakeDb(
      intent({
        intentState: "paid",
        state: "approved",
        providerChargeId: "900001",
        efiLastEventId: 3,
      }),
    );
    await expect(service(db).handleEfiNotification(post(SECRET))).resolves.toMatchObject({
      body: { outcome: "duplicate" },
    });
    expect(cardPayments.confirm).not.toHaveBeenCalled();
    expect(cardPayments.decline).not.toHaveBeenCalled();
  });

  it("cobrança desconhecida: registrada como unmatched; consulta com erro = 503 (Efí reenvia)", async () => {
    const unknown = fakeDb(null);
    await expect(service(unknown.db).handleEfiNotification(post(SECRET))).resolves.toMatchObject({
      body: { outcome: "unmatched" },
    });
    const failing = efiGateway({
      getNotification: vi.fn(async () => {
        throw new EfiError({
          kind: "provider_unavailable",
          status: 502,
          code: "HTTP_502",
          endpoint: "x",
        });
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      service(fakeDb(intent()).db, failing).handleEfiNotification(post(SECRET)),
    ).resolves.toMatchObject({ status: 503 });
  });
});

describe("webhook da AbacatePay roteado pelo PIX", () => {
  const ENV = { webhookSecret: "segredo-webhook-teste", signingKey: "chave-publica-teste" };

  async function signed(status: string, event = "transparent.completed") {
    const rawBody = JSON.stringify({
      id: `log_${status}_${event}`,
      event,
      apiVersion: 2,
      devMode: true,
      data: {
        transparent: {
          id: "card_TESTE000000000000000001",
          amount: 5990,
          status,
          method: "CARD",
          platformFee: 385,
          metadata: { intentId: "intent_teste_003" },
        },
      },
    });
    return {
      rawBody,
      querySecret: ENV.webhookSecret,
      signature: await signAbacatePayBody(rawBody, ENV.signingKey),
    };
  }

  function pix(db: FoodeDb) {
    return createPixService({
      db,
      provider: {
        gateway: { createPixCharge: vi.fn(), checkPixCharge: vi.fn() },
        webhook: ENV,
      },
      card: service(db),
    });
  }

  it("APPROVED confirma com o evento; FAILED recusa; estorno fica para o Ticket 12", async () => {
    const pending = intent({
      provider: "abacatepay",
      cardMode: "rapido",
      intentState: "pending",
      state: "pending",
      providerChargeId: "card_TESTE000000000000000001",
    });
    const approved = fakeDb(pending);
    await expect(pix(approved.db).handleWebhook(await signed("APPROVED"))).resolves.toMatchObject({
      status: 200,
      body: { outcome: "applied" },
    });
    expect(approved.cardPayments.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          provider: "abacatepay",
          eventId: "log_APPROVED_transparent.completed",
        }),
      }),
    );

    const failed = fakeDb(pending);
    await expect(pix(failed.db).handleWebhook(await signed("FAILED"))).resolves.toMatchObject({
      body: { outcome: "declined" },
    });
    expect(failed.cardPayments.decline).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "issuer_declined" }),
    );

    const refunded = fakeDb(pending);
    await expect(
      pix(refunded.db).handleWebhook(await signed("REFUNDED", "transparent.refunded")),
    ).resolves.toMatchObject({ body: { outcome: "deferred" } });
    expect(refunded.cardPayments.confirm).not.toHaveBeenCalled();
  });

  it("intenção de outro provedor pelo metadata não é usada", async () => {
    const { db, cardPayments } = fakeDb(intent({ provider: "efi" }));
    cardPayments.byProviderCharge.mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(pix(db).handleWebhook(await signed("APPROVED"))).resolves.toMatchObject({
      body: { outcome: "unmatched" },
    });
  });
});

describe("página do Pedido", () => {
  const tokenizer = {
    sdk: "efi" as const,
    payeeCode: "0123456789abcdef",
    environment: "sandbox" as const,
  };

  it("recusado: motivo e ações conforme a Loja agora; aprovado/pendente sem ações", () => {
    const declined = toOrderCard(intent({ state: "declined", declineReason: "issuer_declined" }), {
      tokenizer,
      pixAvailable: true,
    });
    expect(orderCardSchema.parse(declined)).toMatchObject({
      state: "declined",
      declineReason: "issuer_declined",
      retryActions: ["other_card", "pix"],
      tokenizer,
    });
    const onlyPix = toOrderCard(intent({ state: "declined", declineReason: null }), {
      tokenizer: null,
      pixAvailable: true,
    });
    expect(onlyPix).toMatchObject({ declineReason: "unknown", retryActions: ["pix"] });
    for (const state of ["processing", "pending", "approved"] as const) {
      const card = orderCardSchema.parse(
        toOrderCard(intent({ state }), { tokenizer, pixAvailable: true }),
      );
      expect(card).toMatchObject({ state, retryActions: [], tokenizer: null, declineReason: null });
    }
  });

  it("tentativa sem desfecho além do prazo vira indisponível; pendente consulta no máximo a cada 60 s", async () => {
    const stale = fakeDb(
      intent({
        attemptStartedAt: new Date(NOW.getTime() - CARD_PROCESSING_GIVE_UP_MS - 1).toISOString(),
      }),
    );
    await service(stale.db).viewForOrder("order-a", { tokenizer: null, pixAvailable: false });
    expect(stale.cardPayments.decline).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "provider_unavailable", failureCode: "give_up" }),
    );

    const fresh = fakeDb(intent({ attemptStartedAt: NOW.toISOString() }));
    await service(fresh.db).viewForOrder("order-a", { tokenizer: null, pixAvailable: false });
    expect(fresh.cardPayments.decline).not.toHaveBeenCalled();

    const efi = efiGateway();
    const pending = fakeDb(
      intent({
        intentState: "pending",
        state: "pending",
        providerChargeId: "900001",
        checkedAt: NOW.toISOString(),
      }),
    );
    await service(pending.db, efi).viewForOrder("order-a", {
      tokenizer: null,
      pixAvailable: false,
    });
    expect(efi.getCharge).not.toHaveBeenCalled();
    const due = fakeDb(
      intent({ intentState: "pending", state: "pending", providerChargeId: "900001" }),
    );
    await service(due.db, efi).viewForOrder("order-a", { tokenizer: null, pixAvailable: false });
    expect(efi.getCharge).toHaveBeenCalledWith(900001);
    expect(due.cardPayments.markChecked).toHaveBeenCalled();
  });
});

describe("utilitários", () => {
  it("motivo do recusado por erro do provedor", () => {
    const efi = (init: Partial<ConstructorParameters<typeof EfiError>[0]>) =>
      new EfiError({
        kind: "validation",
        status: 400,
        code: "validation_error",
        endpoint: "x",
        ...init,
      });
    expect(declineReasonOfError(efi({ property: "/payment/credit_card/customer/birth" }))).toBe(
      "invalid_payer_data",
    );
    expect(declineReasonOfError(efi({ property: "/payment/credit_card/payment_token" }))).toBe(
      "token_expired",
    );
    expect(declineReasonOfError(efi({}))).toBe("unknown");
    expect(declineReasonOfError(efi({ kind: "rate_limited", retriable: true }))).toBe(
      "provider_unavailable",
    );
    expect(declineReasonOfError(efi({ kind: "network", uncertain: true }))).toBeNull();
    expect(
      declineReasonOfError(
        new AbacatePayError({
          kind: "provider_unavailable",
          status: 503,
          code: "x",
          endpoint: "y",
          retriable: true,
        }),
      ),
    ).toBe("provider_unavailable");
    expect(declineReasonOfError(new TypeError("x"))).toBe("unknown");
    expect(declineReasonOfError(new Error("x"))).toBeNull();
  });

  it("telefone nacional para os provedores", () => {
    expect(nationalPhone("+5511912345678")).toBe("11912345678");
    expect(nationalPhone("11912345678")).toBe("11912345678");
  });
});

describe("Ticket 12: Estorno no Cartão", () => {
  function withRefunds(current: CardIntentView, efi = efiGateway()) {
    const fake = fakeDb(current);
    const refunds = {
      afterPayment: vi.fn(async () => undefined),
      orphanCardCharge: vi.fn(async () => undefined),
      confirmFromWebhook: vi.fn(async () => "applied" as const),
    };
    const svc = createCardService({
      db: fake.db,
      efi: {
        gateway: efi,
        payeeCode: "0123456789abcdef0123456789abcdef",
        environment: "sandbox",
        notificationSecret: SECRET,
        notificationUrl: "https://api.exemplo.test/webhooks/efi",
      },
      abacatePay: { gateway: abacateGateway(), publicKey: "pk_dev_publica" },
      refunds,
      now: () => NOW,
    });
    return { ...fake, svc, refunds };
  }

  const post = {
    rawBody: `notification=${EFI_TOKEN}`,
    contentType: "application/x-www-form-urlencoded",
    querySecret: SECRET,
  };

  it("notificação Efí `refunded` conclui o Estorno pela cobrança (idempotente pelo evento)", async () => {
    const refundedHistory = parseEfiNotificationEvents([
      {
        id: 4,
        type: "charge",
        custom_id: "intent_teste_003",
        status: { current: "refunded", previous: "paid" },
        identifiers: { charge_id: 900001 },
        created_at: "2026-11-05 13:00:00",
      },
    ]);
    const efi = efiGateway({ getNotification: vi.fn(async () => refundedHistory) });
    const { svc, refunds, cardPayments } = withRefunds(
      intent({
        intentState: "paid",
        state: "approved",
        providerChargeId: "900001",
        efiLastEventId: 3,
      }),
      efi,
    );
    await expect(svc.handleEfiNotification(post)).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "applied" },
    });
    expect(refunds.confirmFromWebhook).toHaveBeenCalledWith({
      providerChargeId: "900001",
      event: {
        provider: "efi",
        eventId: "efi:900001:4",
        eventType: "charge:refunded",
        devMode: true,
      },
    });
    expect(cardPayments.confirm).not.toHaveBeenCalled();
  });

  it("aprovado confirma e dispara o Estorno tardio; confirmação recusada vira Estorno órfão", async () => {
    const approved = withRefunds(intent());
    await approved.svc.chargeForOrder("order-a", efiCard, CPF);
    expect(approved.refunds.afterPayment).toHaveBeenCalledWith("intent_teste_003");

    const rejected = withRefunds(intent());
    rejected.cardPayments.confirm.mockResolvedValue("rejected" as never);
    await rejected.svc.chargeForOrder("order-a", efiCard, CPF);
    expect(rejected.refunds.orphanCardCharge).toHaveBeenCalledWith({
      intentId: "intent_teste_003",
      providerChargeId: "900001",
    });
  });
});
