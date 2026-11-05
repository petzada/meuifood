import { describe, expect, it } from "vitest";
import cardApproved from "./__fixtures__/card-create-approved.json";
import cardDeclined from "./__fixtures__/card-create-declined.json";
import pixCheckPaid from "./__fixtures__/pix-check-paid.json";
import pixCreate from "./__fixtures__/pix-create.json";
import refundAlready from "./__fixtures__/refund-already-refunded.json";
import refundInsufficient from "./__fixtures__/refund-insufficient-funds.json";
import refundOk from "./__fixtures__/refund-ok.json";
import { createAbacatePayClient, type FetchLike } from "./client.js";
import { AbacatePayError } from "./errors.js";

type Call = { url: string; init: RequestInit };

function mockFetch(status: number, body: unknown, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const API_KEY = "test_key";

function client(fetchImpl: FetchLike) {
  return createAbacatePayClient({ apiKey: API_KEY, fetch: fetchImpl });
}

async function captureError(promise: Promise<unknown>): Promise<AbacatePayError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AbacatePayError) return error;
    throw error;
  }
  throw new Error("esperava AbacatePayError");
}

const customer = {
  name: "Cliente Teste",
  email: "cliente@example.com",
  taxId: "000.000.000-00",
  cellphone: "11999999999",
};

describe("createPixCharge", () => {
  it("envia PIX com intentId em metadata e normaliza a resposta", async () => {
    const calls: Call[] = [];
    const result = await client(mockFetch(200, pixCreate, calls)).createPixCharge({
      intentId: "intent_teste_001",
      amountCents: 5990,
      expiresInSeconds: 1800,
      metadata: { pedidoId: "pedido_teste_001" },
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.abacatepay.com/v2/transparents/create");
    expect(call?.init.method).toBe("POST");
    expect((call?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(String(call?.init.body))).toEqual({
      method: "PIX",
      data: {
        amount: 5990,
        expiresIn: 1800,
        metadata: { pedidoId: "pedido_teste_001", intentId: "intent_teste_001" },
      },
    });
    expect(result).toEqual({
      id: "pix_char_TESTE000000000000000001",
      status: "PENDING",
      amountCents: 5990,
      brCode: pixCreate.data.brCode,
      brCodeBase64: pixCreate.data.brCodeBase64,
      platformFeeCents: 54,
      expiresAt: "2026-11-04T15:30:00.000Z",
      devMode: true,
      metadata: { intentId: "intent_teste_001", pedidoId: "pedido_teste_001" },
    });
  });

  it("intentId do chamador prevalece sobre metadata.intentId", async () => {
    const calls: Call[] = [];
    await client(mockFetch(200, pixCreate, calls)).createPixCharge({
      intentId: "intent_certo",
      amountCents: 100,
      metadata: { intentId: "intent_errado" },
    });
    expect(JSON.parse(String(calls[0]?.init.body)).data.metadata.intentId).toBe("intent_certo");
  });

  it("rejeita valor abaixo do mínimo sem chamar a API", async () => {
    const calls: Call[] = [];
    await expect(
      client(mockFetch(200, pixCreate, calls)).createPixCharge({ intentId: "i", amountCents: 99 }),
    ).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("timeout vira erro incerto e retriable", async () => {
    const failing: FetchLike = async () => {
      throw new DOMException("timeout", "TimeoutError");
    };
    const error = await captureError(client(failing).createPixCharge({ intentId: "i", amountCents: 100 }));
    expect(error).toMatchObject({ kind: "timeout", uncertain: true, retriable: true, status: 0 });
  });

  it("2xx com formato inesperado vira invalid_response incerto", async () => {
    const error = await captureError(
      client(mockFetch(200, { data: { id: "x" }, success: true, error: null })).createPixCharge({
        intentId: "i",
        amountCents: 100,
      }),
    );
    expect(error).toMatchObject({ kind: "invalid_response", uncertain: true });
  });

  it("sem chave não chama a API", async () => {
    const calls: Call[] = [];
    const c = createAbacatePayClient({ apiKey: "", fetch: mockFetch(200, pixCreate, calls) });
    const error = await captureError(c.createPixCharge({ intentId: "i", amountCents: 100 }));
    expect(error.kind).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("403 vira forbidden e a mensagem não carrega a chave", async () => {
    const error = await captureError(
      client(mockFetch(403, { data: null, error: "Insufficient permissions", success: false })).createPixCharge({
        intentId: "i",
        amountCents: 100,
      }),
    );
    expect(error.kind).toBe("forbidden");
    expect(error.message).not.toContain(API_KEY);
  });

  it("5xx é retriable", async () => {
    const error = await captureError(
      client(mockFetch(502, "bad gateway")).createPixCharge({ intentId: "i", amountCents: 100 }),
    );
    expect(error).toMatchObject({ kind: "provider_unavailable", retriable: true, code: "HTTP_502" });
  });
});

describe("checkPixCharge", () => {
  it("consulta por id na query e devolve o status", async () => {
    const calls: Call[] = [];
    const result = await client(mockFetch(200, pixCheckPaid, calls)).checkPixCharge("pix_char_TESTE1");
    expect(calls[0]?.url).toBe("https://api.abacatepay.com/v2/transparents/check?id=pix_char_TESTE1");
    expect(calls[0]?.init.method).toBe("GET");
    expect(result).toEqual({ status: "PAID", expiresAt: "2026-11-04T15:30:00.000Z" });
  });

  it("o endpoint do erro não carrega a query", async () => {
    const error = await captureError(
      client(mockFetch(404, { data: null, error: "TRANSACTION_NOT_FOUND", success: false })).checkPixCharge(
        "pix_char_SEGREDO",
      ),
    );
    expect(error.kind).toBe("not_found");
    expect(error.endpoint).toBe("GET /transparents/check");
    expect(error.message).not.toContain("SEGREDO");
  });
});

describe("createCardCharge (Rápido)", () => {
  it("envia os quatro campos de customer e não expõe cardToken", async () => {
    const calls: Call[] = [];
    const result = await client(mockFetch(200, cardApproved, calls)).createCardCharge({
      intentId: "intent_teste_002",
      amountCents: 5990,
      token: "ctok_teste",
      customer,
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      method: "CARD",
      data: {
        amount: 5990,
        token: "ctok_teste",
        customer,
        metadata: { intentId: "intent_teste_002" },
      },
    });
    expect(result).toEqual({
      id: "card_TESTE000000000000000001",
      status: "APPROVED",
      amountCents: 5990,
      brand: "visa",
      lastFour: "4242",
      platformFeeCents: 385,
      devMode: true,
      metadata: { intentId: "intent_teste_002" },
    });
    expect(JSON.stringify(result)).not.toContain("card_token");
  });

  it("exige name, email, taxId e cellphone", async () => {
    await expect(
      client(mockFetch(200, cardApproved)).createCardCharge({
        intentId: "i",
        amountCents: 100,
        token: "ctok_teste",
        customer: { ...customer, cellphone: "" },
      }),
    ).rejects.toThrow(TypeError);
  });

  it("recusa (400 genérico) vira card_declined, sem retry", async () => {
    const error = await captureError(
      client(mockFetch(400, cardDeclined)).createCardCharge({
        intentId: "i",
        amountCents: 100,
        token: "ctok_teste",
        customer,
      }),
    );
    expect(error).toMatchObject({ kind: "card_declined", retriable: false, uncertain: false });
  });

  it("getCardCharge usa /transparents/get", async () => {
    const calls: Call[] = [];
    const result = await client(mockFetch(200, cardApproved, calls)).getCardCharge("card_TESTE1");
    expect(calls[0]?.url).toBe("https://api.abacatepay.com/v2/transparents/get?id=card_TESTE1");
    expect(result.status).toBe("APPROVED");
  });
});

describe("refundCharge", () => {
  it("estorno total por id", async () => {
    const calls: Call[] = [];
    const result = await client(mockFetch(200, refundOk, calls)).refundCharge({
      id: "pix_char_TESTE000000000000000001",
      reason: "Pedido cancelado",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      id: "pix_char_TESTE000000000000000001",
      reason: "Pedido cancelado",
    });
    expect(result).toEqual({ id: "pix_char_TESTE000000000000000001", status: "REFUNDED", alreadyRefunded: false });
  });

  it("'já foi reembolsada' é sucesso idempotente", async () => {
    const result = await client(mockFetch(400, refundAlready)).refundCharge({ id: "pix_char_X" });
    expect(result).toEqual({ id: "pix_char_X", status: "REFUNDED", alreadyRefunded: true });
  });

  it("INSUFFICIENT_FUNDS sobe como erro tipado", async () => {
    const error = await captureError(client(mockFetch(400, refundInsufficient)).refundCharge({ id: "pix_char_X" }));
    expect(error).toMatchObject({ kind: "insufficient_funds", retriable: false, code: "INSUFFICIENT_FUNDS" });
  });

  it("LOCK_NOT_ACQUIRED é retriable", async () => {
    const error = await captureError(
      client(mockFetch(409, { data: null, error: "LOCK_NOT_ACQUIRED", success: false })).refundCharge({
        id: "card_X",
      }),
    );
    expect(error).toMatchObject({ kind: "lock_not_acquired", retriable: true });
  });

  it("TRANSACTION_UNDER_DISPUTE vira under_dispute", async () => {
    const error = await captureError(
      client(mockFetch(400, { data: null, error: "TRANSACTION_UNDER_DISPUTE", success: false })).refundCharge({
        id: "card_X",
      }),
    );
    expect(error.kind).toBe("under_dispute");
  });
});
