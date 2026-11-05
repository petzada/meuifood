import { describe, expect, it } from "vitest";

import {
  CUSTOMER_ERROR_CODES,
  customerCodeRequestSchema,
  customerCodeVerifySchema,
  customerErrorHttpStatus,
  customerErrorMessagePt,
  customerErrorSchema,
  customerSessionStateSchema,
  customerSignupSchema,
  loginCodeMessage,
  maskCpf,
  maskPhoneE164,
  opsCustomerFindInputSchema,
} from "./index.js";

describe("login por código no WhatsApp", () => {
  it("mensagem exata da decisão 65", () => {
    expect(loginCodeMessage("0427")).toBe("0427 é o seu código de acesso ao Foode Delivery.");
  });

  it("código de 4 dígitos, telefone normalizado e Turnstile obrigatório", () => {
    expect(
      customerCodeVerifySchema.parse({
        phone: "(11) 91234-5678",
        code: " 0427 ",
        turnstileToken: "t",
      }),
    ).toEqual({ phone: "5511912345678", code: "0427", turnstileToken: "t" });
    expect(
      customerCodeVerifySchema.safeParse({
        phone: "11912345678",
        code: "12345",
        turnstileToken: "t",
      }).success,
    ).toBe(false);
    expect(customerCodeRequestSchema.safeParse({ phone: "11912345678" }).success).toBe(false);
    expect(
      customerCodeRequestSchema.safeParse({ phone: "1133334444", turnstileToken: "t" }).success,
    ).toBe(false);
  });

  it("status e mensagem por erro; indisponível sem secrets com o texto combinado", () => {
    for (const code of CUSTOMER_ERROR_CODES) {
      expect(customerErrorHttpStatus(code)).toBeGreaterThanOrEqual(400);
    }
    expect(customerErrorMessagePt({ error: "login_unavailable" })).toBe(
      "Login pelo WhatsApp indisponível no momento",
    );
    expect(customerErrorMessagePt({ error: "code_invalid", attemptsLeft: 1 })).toContain(
      "1 tentativa.",
    );
    expect(customerErrorMessagePt({ error: "code_invalid", attemptsLeft: 0 })).toContain("novo");
    expect(customerErrorMessagePt({ error: "resend_too_soon", retryAfterSeconds: 12 })).toContain(
      "12 s",
    );
    for (const error of [
      "invalid_input",
      "captcha_failed",
      "rate_limited",
      "code_expired",
      "code_attempts_exhausted",
      "unauthenticated",
      "store_not_found",
    ] as const) {
      expect(customerErrorMessagePt({ error }).length).toBeGreaterThan(5);
    }
    expect(customerErrorSchema.parse({ error: "code_invalid", attemptsLeft: 3 })).toBeTruthy();
  });

  it("conflito de conta: chat só com o widget ativo; nunca dado da outra conta", () => {
    expect(customerErrorMessagePt({ error: "account_conflict" }, { supportChatActive: true })).toBe(
      "Não foi possível concluir o cadastro. Fale com o suporte Foode pelo chat.",
    );
    const off = customerErrorMessagePt({ error: "account_conflict" });
    expect(off).toBe("Não foi possível concluir o cadastro.");
    expect(off).not.toContain("wa.me");
  });
});

describe("conta", () => {
  it("CPF obrigatório com dígito verificador; normaliza a máscara", () => {
    expect(customerSignupSchema.parse({ name: " Maria ", cpf: "529.982.247-25" })).toEqual({
      name: "Maria",
      cpf: "52998224725",
    });
    expect(customerSignupSchema.safeParse({ name: "Maria", cpf: "529.982.247-24" }).success).toBe(
      false,
    );
    expect(customerSignupSchema.safeParse({ name: "Maria", cpf: "111.111.111-11" }).success).toBe(
      false,
    );
    expect(customerSignupSchema.safeParse({ name: "", cpf: "52998224725" }).success).toBe(false);
  });

  it("máscaras de CPF e telefone", () => {
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
    expect(maskCpf("123")).toBe("***.***.***-**");
    expect(maskPhoneE164("5511912345678")).toBe("(11) *****-5678");
    expect(maskPhoneE164("x")).toBe("(**) *****-****");
  });

  it("estado da sessão e busca do Ops por telefone ou CPF", () => {
    expect(customerSessionStateSchema.parse({ state: "anonymous" })).toEqual({
      state: "anonymous",
    });
    expect(
      customerSessionStateSchema.safeParse({ state: "signup_required", phone: "11912345678" })
        .success,
    ).toBe(false);
    expect(opsCustomerFindInputSchema.parse({ phone: "11912345678" })).toEqual({
      phone: "5511912345678",
    });
    expect(opsCustomerFindInputSchema.parse({ cpf: "529.982.247-25" })).toEqual({
      cpf: "52998224725",
    });
  });
});
