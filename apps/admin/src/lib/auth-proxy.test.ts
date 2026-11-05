// @vitest-environment node
// Código de servidor: Request/Headers do Node (o happy-dom não expõe Set-Cookie nem
// cabeçalhos proibidos ao navegador).
import { describe, expect, it, vi } from "vitest";

import { proxyAuthRequest } from "./auth-proxy";

function api(response: Response) {
  const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => response);
  return { fetch };
}

describe("proxy /api/auth/* → api (service binding)", () => {
  it("repassa método, URL, cookie e body; sobrescreve cf-connecting-ip com o IP da borda", async () => {
    const target = api(Response.json({ ok: true }));
    const request = new Request("https://painel.example/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=abc",
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "10.0.0.1",
        "x-captcha-response": "tok",
        host: "painel.example",
      },
      body: JSON.stringify({ email: "a@b.co", password: "x" }),
    });

    await proxyAuthRequest(request, target);

    const sent = target.fetch.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(Request);
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toBe("https://painel.example/api/auth/sign-in/email");
    expect(sent?.headers.get("cookie")).toBe("better-auth.session_token=abc");
    expect(sent?.headers.get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(sent?.headers.get("x-captcha-response")).toBe("tok");
    expect(sent?.headers.get("host")).toBeNull();
    await expect(sent?.json()).resolves.toEqual({ email: "a@b.co", password: "x" });
  });

  it("sem IP na borda em produção, não deixa o header chegar à api; em dev usa loopback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const target = api(new Response(null, { status: 204 }));
    await proxyAuthRequest(
      new Request("https://painel.example/api/auth/get-session", {
        headers: { "cf-connecting-ip": "   " },
      }),
      target,
    );
    expect(target.fetch.mock.calls[0]?.[0]?.headers.has("cf-connecting-ip")).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    const dev = api(new Response(null, { status: 204 }));
    await proxyAuthRequest(new Request("https://localhost:3001/api/auth/get-session"), dev);
    expect(dev.fetch.mock.calls[0]?.[0]?.headers.get("cf-connecting-ip")).toBe("127.0.0.1");
    vi.unstubAllEnvs();
  });

  it("devolve status e Set-Cookie da api para o navegador", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append(
      "set-cookie",
      "__Secure-better-auth.session_token=s1; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    headers.append("set-cookie", "better-auth.csrf=c; Path=/");
    const target = api(new Response(JSON.stringify({ user: {} }), { status: 200, headers }));

    const response = await proxyAuthRequest(
      new Request("https://painel.example/api/auth/sign-in/email", { method: "POST", body: "{}" }),
      target,
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[0]).toContain("session_token=s1");
  });

  it("não segue redirect do callback de reset: o navegador é quem segue", async () => {
    const target = api(
      new Response(null, { status: 302, headers: { location: "/definir-senha?token=t1" } }),
    );
    const response = await proxyAuthRequest(
      new Request("https://painel.example/api/auth/reset-password/t1?callbackURL=/definir-senha"),
      target,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/definir-senha?token=t1");
    expect(target.fetch.mock.calls[0]?.[0]?.redirect).toBe("manual");
  });
});
