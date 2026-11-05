// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
const apiFetch = vi.fn<ApiFetch>();
vi.mock("../../../lib/api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => apiFetch(...args),
}));

const { POST } = await import("./route");

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://foodedelivery.com.br/contato/lead", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = {
  name: "Ana",
  whatsapp: "(11) 99999-1234",
  storeName: "Burger da Ana",
  city: "São Paulo",
  ordersPerDay: "10_a_50",
  source: "cta-final",
  turnstileToken: "token-do-widget",
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("POST /contato/lead", () => {
  it("repassa o lead normalizado à api com o token e o IP do navegador", async () => {
    apiFetch.mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
    const response = await POST(post(valid, { "cf-connecting-ip": "203.0.113.7" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });

    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/storefront/leads");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["cf-connecting-ip"]).toBe("203.0.113.7");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Ana",
      whatsapp: "5511999991234",
      storeName: "Burger da Ana",
      city: "São Paulo",
      ordersPerDay: "10_a_50",
      source: "cta-final",
      turnstileToken: "token-do-widget",
    });
  });

  it("Turnstile recusado (403) e rate limit (429) viram mensagem com o atalho", async () => {
    apiFetch.mockResolvedValueOnce(Response.json({ error: "captcha_failed" }, { status: 403 }));
    const denied = await POST(post(valid));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ ok: false, kind: "unavailable" });

    apiFetch.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429 }));
    const limited = await POST(post(valid));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ ok: false, kind: "unavailable" });
  });

  it("api fora ou 5xx = 502 controlado", async () => {
    apiFetch.mockRejectedValueOnce(new Error("binding"));
    expect((await POST(post(valid))).status).toBe(502);
    apiFetch.mockResolvedValueOnce(new Response("x", { status: 500 }));
    const failed = await POST(post(valid));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ ok: false, kind: "unavailable" });
  });

  it("devolve 400 com os erros por campo sem chamar a api", async () => {
    const response = await POST(post({ ...valid, whatsapp: "1234", city: "" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.kind).toBe("invalid");
    expect(Object.keys(body.errors).sort()).toEqual(["city", "whatsapp"]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("devolve 400 quando o corpo não é JSON", async () => {
    const response = await POST(post("{nope"));
    expect(response.status).toBe(400);
  });
});
