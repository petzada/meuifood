// @vitest-environment node
// Route handlers do checkout: validam o corpo com o contrato, repassam o IP do navegador em
// `cf-connecting-ip` (rate limit por IP na api), devolvem os erros do contrato (409/422) e os
// passthrough (429/403), e transformam 5xx/501 ou corpo fora do contrato em 502.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ids } from "../app/loja/[slug]/storefront/fixtures";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
const apiFetch = vi.fn<ApiFetch>();
vi.mock("./api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => apiFetch(...args),
}));

const lines = [{ additionalIds: [], complementSelections: {}, itemId: ids.soda, quantity: 2 }];
const createBody = {
  customer: { name: "Maria", phone: "11912345678" },
  fulfillment: "pickup",
  idempotencyKey: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
  lines,
  note: null,
  payment: { changeForCents: null, method: "on_delivery" },
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://web.test/x", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

async function createOrder(
  body: unknown,
  headers?: Record<string, string>,
  slug = "lanchonete-do-ze",
) {
  const { POST } = await import("../app/loja/[slug]/finalizar/pedido/route");
  return POST(post(body, headers), { params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("POST /loja/[slug]/finalizar/pedido", () => {
  it("valida com o contrato, normaliza o telefone e repassa o IP do navegador", async () => {
    apiFetch.mockResolvedValue(
      Response.json(
        {
          accessToken: "a".repeat(40),
          ok: true,
          orderCode: 3,
          replayed: false,
          trackingPath: "/loja/lanchonete-do-ze/pedido/x",
        },
        { status: 201 },
      ),
    );
    const response = await createOrder(createBody, { "cf-connecting-ip": "203.0.113.9" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/storefront/lojas/lanchonete-do-ze/pedidos");
    expect(new Headers(init?.headers).get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      customer: { name: "Maria", phone: "5511912345678" },
      idempotencyKey: createBody.idempotencyKey,
    });
  });

  it("repassa o cookie da sessão do Consumidor (useAccountCpf, decisão 65) e normaliza o 422", async () => {
    apiFetch.mockResolvedValue(
      Response.json({ error: "account_cpf_unavailable" }, { status: 422 }),
    );
    const response = await createOrder(createBody, { cookie: "__Host-foode_consumidor=abc" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "account_cpf_unavailable" },
      ok: false,
    });
    const [, init] = apiFetch.mock.calls[0]!;
    expect(new Headers(init?.headers).get("cookie")).toBe("__Host-foode_consumidor=abc");
    // Sem cookie no navegador, nada é inventado.
    await createOrder(createBody);
    expect(new Headers(apiFetch.mock.calls[1]![1]?.headers).has("cookie")).toBe(false);
  });

  it("corpo inválido ou Slug inválido não chega à api", async () => {
    expect((await createOrder({ ...createBody, lines: [] })).status).toBe(400);
    expect((await createOrder("{nope")).status).toBe(400);
    expect((await createOrder(createBody, {}, "Slug Inválido")).status).toBe(404);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("erros do contrato (409/422) passam com o corpo parseado", async () => {
    apiFetch.mockResolvedValue(
      Response.json(
        { error: { code: "below_minimum", minimumCents: 2000, missingCents: 800 }, ok: false },
        { status: 422 },
      ),
    );
    const response = await createOrder(createBody);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "below_minimum", minimumCents: 2000, missingCents: 800 },
      ok: false,
    });
  });

  it("501, 5xx e corpo fora do contrato viram 502", async () => {
    apiFetch.mockResolvedValue(Response.json({ error: "not_implemented" }, { status: 501 }));
    expect((await createOrder(createBody)).status).toBe(502);
    apiFetch.mockResolvedValue(Response.json({ ok: true }));
    expect((await createOrder(createBody)).status).toBe(502);
    apiFetch.mockRejectedValue(new Error("binding"));
    const response = await createOrder(createBody);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "order_unavailable" });
  });
});

describe("POST /loja/[slug]/finalizar/busca", () => {
  it("429 e 403 da api passam como vieram; 200 é mascarado pelo contrato", async () => {
    const { POST } = await import("../app/loja/[slug]/finalizar/busca/route");
    const body = { phone: "11912345678", turnstileToken: "tok" };
    apiFetch.mockResolvedValue(Response.json({ error: "rate_limited" }, { status: 429 }));
    let response = await POST(post(body), {
      params: Promise.resolve({ slug: "lanchonete-do-ze" }),
    });
    expect(response.status).toBe(429);
    apiFetch.mockResolvedValue(Response.json({ error: "captcha_failed" }, { status: 403 }));
    response = await POST(post(body), { params: Promise.resolve({ slug: "lanchonete-do-ze" }) });
    expect(response.status).toBe(403);
    apiFetch.mockResolvedValue(
      Response.json({
        confirmToken: "c".repeat(40),
        found: true,
        masked: { firstName: "Maria", neighborhood: null, street: "Rua A" },
      }),
    );
    response = await POST(post(body), { params: Promise.resolve({ slug: "lanchonete-do-ze" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ found: true, masked: { firstName: "Maria" } });
    expect(JSON.parse(String(apiFetch.mock.calls[2]![1]?.body))).toEqual({
      phone: "5511912345678",
      turnstileToken: "tok",
    });
  });
});

describe("POST /loja/[slug]/pedido/[token]/pix", () => {
  it("corpo vazio vai à api com o cookie; 201/200 e 409/422 do contrato passam; 404 passa", async () => {
    const { POST } = await import("../app/loja/[slug]/pedido/[token]/pix/route");
    const token = "t".repeat(40);
    const call = (body: unknown = {}) =>
      POST(post(body, { cookie: "__Host-foode_consumidor=abc" }), {
        params: Promise.resolve({ slug: "lanchonete-do-ze", token }),
      });
    apiFetch.mockResolvedValue(
      Response.json(
        { ok: true, replayed: false, trackingPath: "/loja/x/pedido/t" },
        { status: 201 },
      ),
    );
    let response = await call();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      replayed: false,
      trackingPath: "/loja/x/pedido/t",
    });
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe(`/storefront/lojas/lanchonete-do-ze/pedidos/${token}/pix`);
    expect(String(init?.body)).toBe("{}");
    expect(new Headers(init?.headers).get("cookie")).toBe("__Host-foode_consumidor=abc");

    apiFetch.mockResolvedValue(Response.json({ error: "attempt_active" }, { status: 409 }));
    response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "attempt_active" });
    apiFetch.mockResolvedValue(
      Response.json({ error: "payment_method_unavailable" }, { status: 422 }),
    );
    expect((await call()).status).toBe(422);
    apiFetch.mockResolvedValue(Response.json({ error: "order_not_found" }, { status: 404 }));
    expect((await call()).status).toBe(404);
    // Corpo com campo a mais é recusado pelo schema estrito antes de chegar à api.
    apiFetch.mockClear();
    expect((await call({ amountCents: 1 })).status).toBe(400);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("GET /loja/[slug]/pedido/[token]/acompanhar", () => {
  it("token de outra Loja ou inexistente vira 404; indisponível vira 502", async () => {
    const { GET } = await import("../app/loja/[slug]/pedido/[token]/acompanhar/route");
    const token = "t".repeat(40);
    const call = () =>
      GET(new Request("https://web.test/x"), {
        params: Promise.resolve({ slug: "lanchonete-do-ze", token }),
      });
    apiFetch.mockResolvedValue(Response.json({ error: "order_not_found" }, { status: 404 }));
    expect((await call()).status).toBe(404);
    apiFetch.mockResolvedValue(Response.json({ error: "not_implemented" }, { status: 501 }));
    expect((await call()).status).toBe(502);
    expect(apiFetch).toHaveBeenLastCalledWith(
      `/storefront/lojas/lanchonete-do-ze/pedidos/${token}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    // Token fora do formato nem chama a api.
    expect(
      (
        await GET(new Request("https://web.test/x"), {
          params: Promise.resolve({ slug: "lanchonete-do-ze", token: "x" }),
        })
      ).status,
    ).toBe(404);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
