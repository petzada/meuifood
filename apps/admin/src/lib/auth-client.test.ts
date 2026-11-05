import { describe, expect, it, vi } from "vitest";

import {
  classifyFailure,
  requestPasswordReset,
  resetPassword,
  signInWithEmail,
  signOut,
} from "./auth-client";

const fetchWith = (response: Response | Error) =>
  vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;

describe("cliente de auth do navegador", () => {
  it("login posta no próprio Painel com o token do Turnstile no header", async () => {
    const fetchImpl = fetchWith(Response.json({ user: {} }));
    const outcome = await signInWithEmail(
      { email: "dono@example.com", password: "segredo-forte", turnstileToken: "cf-token" },
      fetchImpl,
    );

    expect(outcome).toEqual({ ok: true });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-captcha-response"]).toBe("cf-token");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "dono@example.com",
      password: "segredo-forte",
    });
  });

  it("esqueci a senha manda redirectTo para /definir-senha", async () => {
    const fetchImpl = fetchWith(Response.json({ status: true }));
    await requestPasswordReset({ email: "a@b.co", turnstileToken: "t" }, fetchImpl);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      email: "a@b.co",
      redirectTo: "/definir-senha",
    });
  });

  it("definir senha envia token e senha nova, sem a confirmação", async () => {
    const fetchImpl = fetchWith(Response.json({ status: true }));
    await resetPassword(
      { token: "tok", newPassword: "senha-nova-1", turnstileToken: "t" },
      fetchImpl,
    );
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(String(init.body))).toEqual({ token: "tok", newPassword: "senha-nova-1" });
  });

  it("sair não exige captcha", async () => {
    const fetchImpl = fetchWith(Response.json({ success: true }));
    expect(await signOut(fetchImpl)).toEqual({ ok: true });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("x-captcha-response");
  });

  it("mapeia falhas em códigos de negócio", async () => {
    expect(
      await classifyFailure(Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 })),
    ).toBe("credentials");
    expect(
      await classifyFailure(
        Response.json({ message: "Captcha verification failed" }, { status: 400 }),
      ),
    ).toBe("captcha");
    expect(await classifyFailure(new Response(null, { status: 429 }))).toBe("rate_limited");
    expect(await classifyFailure(Response.json({ code: "INVALID_TOKEN" }, { status: 400 }))).toBe(
      "invalid_token",
    );
    expect(await classifyFailure(new Response("boom", { status: 500 }))).toBe("unknown");
    expect(
      await signInWithEmail(
        { email: "a@b.co", password: "x", turnstileToken: "t" },
        fetchWith(new Error("offline")),
      ),
    ).toEqual({
      ok: false,
      error: "network",
    });
  });
});
