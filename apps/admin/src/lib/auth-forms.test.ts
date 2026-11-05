import { describe, expect, it } from "vitest";

import { parseLoginForm, parsePasswordResetRequest, parseSetPasswordForm } from "./auth-forms";

describe("validação dos formulários de auth (Zod do contrato)", () => {
  it("login normaliza o e-mail e exige senha e Turnstile", () => {
    const ok = parseLoginForm({ email: "  Dono@Example.com ", password: "x", turnstileToken: "t" });
    expect(ok).toEqual({
      ok: true,
      data: { email: "dono@example.com", password: "x", turnstileToken: "t" },
    });

    const bad = parseLoginForm({ email: "nope", password: "", turnstileToken: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.email).toBe("Informe um e-mail válido.");
      expect(bad.errors.password).toBe("Informe sua senha.");
      expect(bad.errors.turnstileToken).toBe("Aguarde a verificação de segurança terminar.");
    }
  });

  it("esqueci a senha só precisa de e-mail e Turnstile", () => {
    expect(parsePasswordResetRequest({ email: "a@b.co", turnstileToken: "t" }).ok).toBe(true);
    const bad = parsePasswordResetRequest({ email: "", turnstileToken: "t" });
    expect(bad.ok).toBe(false);
  });

  it("definir senha exige tamanho mínimo, confirmação igual e token do link", () => {
    const short = parseSetPasswordForm({
      token: "tok",
      newPassword: "curta",
      confirmPassword: "curta",
      turnstileToken: "t",
    });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors.newPassword).toBe("Use pelo menos 8 caracteres.");

    const mismatch = parseSetPasswordForm({
      token: "tok",
      newPassword: "senha-forte-1",
      confirmPassword: "senha-forte-2",
      turnstileToken: "t",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.errors.confirmPassword).toBe("As senhas não conferem.");

    const noToken = parseSetPasswordForm({
      token: "",
      newPassword: "senha-forte-1",
      confirmPassword: "senha-forte-1",
      turnstileToken: "t",
    });
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.errors.token).toContain("link");
  });
});
