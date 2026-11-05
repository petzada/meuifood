import { describe, expect, it } from "vitest";
import authorize from "./__fixtures__/authorize.json";
import chargeDetailPaid from "./__fixtures__/charge-detail-paid.json";
import notification from "./__fixtures__/notification.json";
import oneStepApproved from "./__fixtures__/one-step-approved.json";
import oneStepUnpaid from "./__fixtures__/one-step-unpaid.json";
import refundOk from "./__fixtures__/refund-ok.json";
import validationError from "./__fixtures__/validation-error.json";
import { createEfiChargesClient, EfiError, type FetchLike } from "./client.js";

type Call = { url: string; init: RequestInit };
type Reply = { status: number; body: unknown };

/** Responde `/v1/authorize` sempre com o token; as demais rotas consomem `replies` em ordem. */
function mockFetch(replies: Reply[], calls: Call[] = []): FetchLike {
  const queue = [...replies];
  return async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/authorize")) return Response.json(authorize);
    const reply = queue.shift();
    if (!reply) throw new Error(`sem resposta para ${url}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
}

function client(fetchImpl: FetchLike, now = () => 0) {
  return createEfiChargesClient({
    clientId: "test_client_id",
    clientSecret: "test_client_secret",
    environment: "sandbox",
    fetch: fetchImpl,
    now,
  });
}

async function captureError(promise: Promise<unknown>): Promise<EfiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EfiError) return error;
    throw error;
  }
  throw new Error("esperava EfiError");
}

const chargeInput = {
  customId: "intent_teste_003",
  amountCents: 5990,
  itemName: "Pedido #123",
  paymentToken: "test_payment_token",
  customer: {
    name: "Cliente Teste",
    cpf: "000.000.000-00",
    email: "cliente@example.com",
    phoneNumber: "(11) 99999-9999",
  },
  notificationUrl: "https://api.example.test/webhooks/efi?secret=test_secret",
};

const headerOf = (call: Call | undefined, name: string) =>
  (call?.init.headers as Record<string, string>)[name];

describe("OAuth", () => {
  it("autentica com Basic e usa Bearer nas chamadas", async () => {
    const calls: Call[] = [];
    await client(mockFetch([{ status: 200, body: chargeDetailPaid }], calls)).getCharge(900001);
    expect(calls[0]?.url).toBe("https://cobrancas-h.api.efipay.com.br/v1/authorize");
    expect(headerOf(calls[0], "Authorization")).toBe(
      `Basic ${btoa("test_client_id:test_client_secret")}`,
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ grant_type: "client_credentials" });
    expect(headerOf(calls[1], "Authorization")).toBe("Bearer test_access_token");
  });

  it("reaproveita o token dentro da validade e renova perto do fim", async () => {
    const calls: Call[] = [];
    let clock = 0;
    const c = client(
      mockFetch(
        [
          { status: 200, body: chargeDetailPaid },
          { status: 200, body: chargeDetailPaid },
          { status: 200, body: chargeDetailPaid },
        ],
        calls,
      ),
      () => clock,
    );
    await c.getCharge(1);
    clock = 500_000; // 600 s de validade - 60 s de margem = renova após 540 s
    await c.getCharge(1);
    clock = 541_000;
    await c.getCharge(1);
    expect(calls.filter((call) => call.url.endsWith("/v1/authorize"))).toHaveLength(2);
  });

  it("401 invalida o token e repete uma vez", async () => {
    const calls: Call[] = [];
    const result = await client(
      mockFetch(
        [
          { status: 401, body: { error: "unauthorized" } },
          { status: 200, body: chargeDetailPaid },
        ],
        calls,
      ),
    ).getCharge(900001);
    expect(result.status).toBe("paid");
    expect(calls.filter((call) => call.url.endsWith("/v1/authorize"))).toHaveLength(2);
  });

  it("sem credenciais não chama a API", async () => {
    const calls: Call[] = [];
    const c = createEfiChargesClient({
      clientId: "",
      clientSecret: "",
      environment: "production",
      fetch: mockFetch([], calls),
    });
    const error = await captureError(c.getCharge(1));
    expect(error.kind).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });
});

describe("createCardCharge (one-step)", () => {
  it("monta o payload à vista com custom_id e só dígitos em cpf/telefone", async () => {
    const calls: Call[] = [];
    const result = await client(
      mockFetch([{ status: 200, body: oneStepApproved }], calls),
    ).createCardCharge(chargeInput);
    const call = calls[1];
    expect(call?.url).toBe("https://cobrancas-h.api.efipay.com.br/v1/charge/one-step");
    expect(JSON.parse(String(call?.init.body))).toEqual({
      items: [{ name: "Pedido #123", value: 5990, amount: 1 }],
      metadata: { custom_id: "intent_teste_003", notification_url: chargeInput.notificationUrl },
      payment: {
        credit_card: {
          installments: 1,
          payment_token: "test_payment_token",
          customer: {
            name: "Cliente Teste",
            cpf: "00000000000",
            email: "cliente@example.com",
            phone_number: "11999999999",
          },
        },
      },
    });
    expect(result).toEqual({
      chargeId: 900001,
      status: "approved",
      totalCents: 5990,
      customId: "intent_teste_003",
      refusalReason: null,
      refusalRetry: null,
    });
  });

  it("inclui birth e billing_address quando informados", async () => {
    const calls: Call[] = [];
    await client(mockFetch([{ status: 200, body: oneStepApproved }], calls)).createCardCharge({
      ...chargeInput,
      customer: { ...chargeInput.customer, birth: "1990-01-31" },
      billingAddress: {
        street: "Rua Teste",
        number: "1",
        neighborhood: "Centro",
        zipcode: "01000-000",
        city: "São Paulo",
        state: "SP",
      },
    });
    const card = JSON.parse(String(calls[1]?.init.body)).payment.credit_card;
    expect(card.customer.birth).toBe("1990-01-31");
    expect(card.billing_address.zipcode).toBe("01000000");
  });

  it("recusa volta como unpaid com motivo, não como exceção", async () => {
    const result = await client(mockFetch([{ status: 200, body: oneStepUnpaid }])).createCardCharge(
      chargeInput,
    );
    expect(result).toMatchObject({
      status: "unpaid",
      refusalReason: "Transação recusada pelo emissor.",
      refusalRetry: true,
    });
  });

  it("validation_error (mesmo com 500) não é retriable e só expõe o campo", async () => {
    const error = await captureError(
      client(mockFetch([{ status: 500, body: validationError }])).createCardCharge(chargeInput),
    );
    expect(error).toMatchObject({
      kind: "validation",
      retriable: false,
      property: "/payment/credit_card/customer/cpf",
      endpoint: "POST /v1/charge/one-step",
    });
    expect(error.message).not.toContain("000.000.000-00");
  });

  it("timeout é incerto (consultar pelo custom_id antes de repetir)", async () => {
    const failing: FetchLike = async (url) => {
      if (url.endsWith("/v1/authorize")) return Response.json(authorize);
      throw new DOMException("timeout", "TimeoutError");
    };
    const error = await captureError(client(failing).createCardCharge(chargeInput));
    expect(error).toMatchObject({ kind: "timeout", uncertain: true });
  });

  it("valida entrada sem chamar a API", async () => {
    const calls: Call[] = [];
    const c = client(mockFetch([], calls));
    await expect(c.createCardCharge({ ...chargeInput, amountCents: 0 })).rejects.toThrow(TypeError);
    await expect(c.createCardCharge({ ...chargeInput, customId: "" })).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });
});

describe("consulta, estorno e cancelamento", () => {
  it("getCharge normaliza o detalhe", async () => {
    const result = await client(mockFetch([{ status: 200, body: chargeDetailPaid }])).getCharge(
      900001,
    );
    expect(result).toEqual({
      chargeId: 900001,
      status: "paid",
      totalCents: 5990,
      customId: "intent_teste_003",
      refusalReason: null,
      refusalRetry: null,
    });
  });

  it("estorno total sem amount; parcial com amount", async () => {
    const calls: Call[] = [];
    const c = client(
      mockFetch(
        [
          { status: 200, body: refundOk },
          { status: 200, body: refundOk },
        ],
        calls,
      ),
    );
    await c.refundCardCharge(900001);
    await c.refundCardCharge(900001, 1000);
    const refunds = calls.filter((call) => call.url.includes("/refund"));
    expect(refunds[0]?.url).toBe(
      "https://cobrancas-h.api.efipay.com.br/v1/charge/card/900001/refund",
    );
    expect(JSON.parse(String(refunds[0]?.init.body))).toEqual({});
    expect(JSON.parse(String(refunds[1]?.init.body))).toEqual({ amount: 1000 });
  });

  it("cancelamento usa PUT /v1/charge/:id/cancel", async () => {
    const calls: Call[] = [];
    await client(mockFetch([{ status: 200, body: { code: 200 } }], calls)).cancelCharge(900002);
    expect(calls[1]?.url).toBe("https://cobrancas-h.api.efipay.com.br/v1/charge/900002/cancel");
    expect(calls[1]?.init.method).toBe("PUT");
  });

  it("getNotification devolve eventos em ordem e o endpoint do erro não carrega o token", async () => {
    const events = await client(mockFetch([{ status: 200, body: notification }])).getNotification(
      "test-token-0001",
    );
    expect(events.map((event) => event.id)).toEqual([1, 2, 3]);

    const error = await captureError(
      client(mockFetch([{ status: 404, body: { error: "not_found" } }])).getNotification(
        "test-token-0002",
      ),
    );
    expect(error.endpoint).toBe("GET /v1/notification/:token");
    expect(error.message).not.toContain("test-token-0002");
  });

  it("token de notificação malformado é recusado antes da rede", async () => {
    await expect(client(mockFetch([])).getNotification("../x")).rejects.toThrow(TypeError);
  });
});
