// @vitest-environment node
// `/falar` (decisão 70): 302 no servidor para o `wa.me` do secret SALES_WHATSAPP; sem número,
// o formulário de contato. O número nunca sai do servidor a não ser no `Location`.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { falarLocation, salesWhatsAppDigits } from "../../lib/falar";

const workerEnv: { SALES_WHATSAPP?: string } = {};
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: workerEnv }),
}));

const { GET } = await import("./route");

const request = () => new Request("https://foodedelivery.com.br/falar");

beforeEach(() => {
  delete workerEnv.SALES_WHATSAPP;
});

describe("GET /falar", () => {
  it("redireciona (302, no-store) para o wa.me com a mensagem inicial", async () => {
    workerEnv.SALES_WHATSAPP = "+55 (11) 91234-5678";
    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://wa.me/5511912345678");
    expect(location.searchParams.get("text")).toContain("site da Foode");
    expect(await response.text()).toBe("");
  });

  it("sem secret (ou inválido) leva ao formulário de contato", async () => {
    const missing = await GET(request());
    expect(missing.status).toBe(302);
    expect(missing.headers.get("location")).toBe("https://foodedelivery.com.br/#contato");

    workerEnv.SALES_WHATSAPP = "123";
    expect((await GET(request())).headers.get("location")).toBe(
      "https://foodedelivery.com.br/#contato",
    );
  });
});

describe("salesWhatsAppDigits", () => {
  it("normaliza para E.164 sem +", () => {
    expect(salesWhatsAppDigits("11 91234-5678")).toBe("5511912345678");
    expect(salesWhatsAppDigits("5511912345678")).toBe("5511912345678");
    expect(salesWhatsAppDigits(undefined)).toBe(null);
    expect(salesWhatsAppDigits("1".repeat(16))).toBe(null);
    expect(falarLocation("", "https://x.test/falar")).toBe("https://x.test/#contato");
  });
});
