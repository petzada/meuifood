import { describe, expect, it } from "vitest";

import { redactUrl, scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

const TOKEN = "abcDEF123_-tokenSecretoDoPedido";

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
