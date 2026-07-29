import { describe, expect, it } from "vitest";

import {
  buildWhatsAppMeUrl,
  normalizeBrazilianMobilePhone,
} from "./phone-br.js";

describe("normalizeBrazilianMobilePhone", () => {
  it("normaliza formatos comuns para E.164 BR celular", () => {
    expect(normalizeBrazilianMobilePhone("(11) 98888-7777")).toEqual({
      e164: "5511988887777",
      ok: true,
    });
    expect(normalizeBrazilianMobilePhone("+55 11 98888-7777")).toEqual({
      e164: "5511988887777",
      ok: true,
    });
    expect(normalizeBrazilianMobilePhone("11988887777")).toEqual({
      e164: "5511988887777",
      ok: true,
    });
  });

  it("rejeita fixo, incompleto ou com DDD inválido", () => {
    expect(normalizeBrazilianMobilePhone("1133334444").ok).toBe(false);
    expect(normalizeBrazilianMobilePhone("1188887777").ok).toBe(false);
    expect(normalizeBrazilianMobilePhone("00988887777").ok).toBe(false);
    expect(normalizeBrazilianMobilePhone("abc").ok).toBe(false);
  });
});

describe("buildWhatsAppMeUrl", () => {
  it("monta wa.me com texto opcional", () => {
    expect(buildWhatsAppMeUrl("5511988887777")).toBe(
      "https://wa.me/5511988887777",
    );
    expect(buildWhatsAppMeUrl("5511988887777", "Pedido ABC123")).toBe(
      "https://wa.me/5511988887777?text=Pedido%20ABC123",
    );
    expect(buildWhatsAppMeUrl("551133334444")).toBeNull();
  });
});
