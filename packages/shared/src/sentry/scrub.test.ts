import { describe, expect, it } from "vitest";

import { redactUrl, scrubBreadcrumb, scrubEvent } from "./index";

const TOKEN = "abcDEF123_-tokenSecretoDoPedido";
const RESET = "resetTokenDeUsoUnico987";

describe("Sentry do Painel sem segredo (Ticket 30, K3)", () => {
  it("convite/redefinição: sem `?token=` em `/definir-senha` e sem token no link do Better Auth", () => {
    expect(redactUrl(`https://admin.foodedelivery.com.br/definir-senha?token=${RESET}`)).toBe(
      "https://admin.foodedelivery.com.br/definir-senha",
    );
    expect(redactUrl(`/api/auth/reset-password/${RESET}?callbackURL=%2Fdefinir-senha`)).toBe(
      "/api/auth/reset-password/:token",
    );
    expect(redactUrl("/api/auth/reset-password")).toBe("/api/auth/reset-password");
  });

  it("evento e breadcrumbs do login/definir senha sem token, corpo (e-mail e senha) e headers", () => {
    const event = scrubEvent({
      request: {
        url: `https://admin.foodedelivery.com.br/definir-senha?token=${RESET}`,
        data: { email: "dono@exemplo.com", password: "segredo" },
        headers: { authorization: "Bearer x", "cf-connecting-ip": "203.0.113.1" },
      },
      transaction: `/definir-senha?token=${RESET}`,
      user: { email: "dono@exemplo.com" },
    });
    expect(JSON.stringify(event)).not.toMatch(new RegExp(`${RESET}|dono@|segredo|203\\.0`, "u"));
    expect(event.request?.url).toBe("https://admin.foodedelivery.com.br/definir-senha");

    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: `/definir-senha?token=${RESET}`, to: "/pedidos" },
    });
    expect(crumb).toEqual({
      category: "navigation",
      data: { from: "/definir-senha", to: "/pedidos" },
    });
    expect(
      JSON.stringify(
        scrubBreadcrumb({ category: "xhr", message: `POST /api/auth/reset-password/${RESET}` }),
      ),
    ).not.toContain(RESET);
  });
});

describe("Sentry do Storefront sem dado pessoal (Ticket 30)", () => {
  it("URL sem token do Pedido, query e hash", () => {
    expect(redactUrl(`https://foodedelivery.com.br/loja/ze/pedido/${TOKEN}?x=1#y`)).toBe(
      "https://foodedelivery.com.br/loja/ze/pedido/:token",
    );
    expect(redactUrl(`/loja/ze/pedido/${TOKEN}/acompanhar`)).toBe(
      "/loja/ze/pedido/:token/acompanhar",
    );
    expect(redactUrl(`/storefront/lojas/ze/pedidos/${TOKEN}/cartao`)).toBe(
      "/storefront/lojas/ze/pedidos/:token/cartao",
    );
    expect(redactUrl("/loja/ze/finalizar")).toBe("/loja/ze/finalizar");
  });

  it("evento sem corpo, cookies, headers, query e usuário", () => {
    const event = scrubEvent({
      request: {
        url: `https://foodedelivery.com.br/loja/ze/pedido/${TOKEN}`,
        data: { phone: "11999999999" },
        query_string: "a=b",
        cookies: { sessao: "x" },
        headers: { cookie: "x" },
      },
      transaction: `/loja/ze/pedido/${TOKEN}`,
      user: { ip_address: "203.0.113.1" },
    });
    expect(event).toEqual({
      request: { url: "https://foodedelivery.com.br/loja/ze/pedido/:token" },
      transaction: "/loja/ze/pedido/:token",
    });
  });

  it("breadcrumbs de navegação/fetch sem token; console sem mensagem", () => {
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/loja/ze/finalizar", to: `/loja/ze/pedido/${TOKEN}` },
      }),
    ).toEqual({
      category: "navigation",
      data: { from: "/loja/ze/finalizar", to: "/loja/ze/pedido/:token" },
    });
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { url: `/loja/ze/pedido/${TOKEN}/acompanhar?t=1`, status_code: 200 },
      }),
    ).toEqual({
      category: "fetch",
      data: { url: "/loja/ze/pedido/:token/acompanhar", status_code: 200 },
    });
    expect(
      scrubBreadcrumb({ category: "console", message: "telefone 11999999999", data: { a: 1 } }),
    ).toEqual({ category: "console" });
    expect(
      JSON.stringify(scrubBreadcrumb({ message: `GET /loja/ze/pedido/${TOKEN}` })),
    ).not.toContain(TOKEN);
  });
});
