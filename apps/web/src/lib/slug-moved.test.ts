// @vitest-environment node
// Decisão 69: link antigo → 308 da api vira 308 do web para `/loja/{atual}{subcaminho}?{query}`,
// em páginas (via `loadPublicMenu`) e route handlers (eventos, carrinho, checkout).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { movedLocation, movedResponse, searchString, slugMovedTo } from "./slug-moved";
import { loadPublicMenu } from "./storefront";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
const apiFetch = vi.fn<ApiFetch>();
vi.mock("./api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => apiFetch(...args),
}));

function moved(currentSlug = "lanchonete-ze") {
  return new Response(JSON.stringify({ error: "slug_moved", currentSlug }), {
    headers: { "content-type": "application/json", "x-foode-current-slug": currentSlug },
    status: 308,
  });
}

describe("slug-moved", () => {
  beforeEach(() => apiFetch.mockReset());

  it("lê o link atual do 308 (corpo ou header) e ignora outros status", async () => {
    expect(await slugMovedTo(moved())).toBe("lanchonete-ze");
    expect(
      await slugMovedTo(
        new Response(null, { headers: { "x-foode-current-slug": "novo" }, status: 308 }),
      ),
    ).toBe("novo");
    expect(await slugMovedTo(new Response("{}", { status: 200 }))).toBeNull();
    expect(await slugMovedTo(new Response("{}", { status: 308 }))).toBeNull();
  });

  it("preserva subcaminho e query no destino", () => {
    expect(movedLocation("https://w.test/loja/antigo/pedido/abc?utm=x&item=1", "novo")).toBe(
      "/loja/novo/pedido/abc?utm=x&item=1",
    );
    const response = movedResponse("https://w.test/loja/antigo/eventos", "novo");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/loja/novo/eventos");
    expect(searchString({ item: "1", utm: ["a", "b"], x: undefined })).toBe("?item=1&utm=a&utm=b");
    expect(searchString(undefined)).toBe("");
  });

  it("loadPublicMenu chama a api sem seguir redirect e devolve `moved`", async () => {
    apiFetch.mockResolvedValue(moved("novo"));
    const result = await loadPublicMenu("antigo", apiFetch);
    expect(result).toEqual({ kind: "moved", currentSlug: "novo" });
    expect(apiFetch).toHaveBeenCalledWith(
      "/storefront/lojas/antigo/cardapio",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("POST /loja/[slug]/eventos repassa o IP, devolve 204 e segue o 308", async () => {
    const { POST } = await import("../app/loja/[slug]/eventos/route");
    const post = (slug: string) =>
      POST(
        new Request(`https://w.test/loja/${slug}/eventos`, {
          body: JSON.stringify({ event: "visit" }),
          headers: { "cf-connecting-ip": "203.0.113.9", "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ slug }) },
      );

    apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await post("ze")).status).toBe(204);
    expect(apiFetch).toHaveBeenCalledWith(
      "/storefront/lojas/ze/eventos",
      expect.objectContaining({
        body: '{"event":"visit"}',
        headers: expect.objectContaining({ "cf-connecting-ip": "203.0.113.9" }),
        redirect: "manual",
      }),
    );

    apiFetch.mockResolvedValueOnce(moved("novo"));
    const redirected = await post("antigo");
    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("location")).toBe("/loja/novo/eventos");

    // Corpo com campo a mais (ex.: telefone) é recusado antes de chegar à api.
    const bad = await POST(
      new Request("https://w.test/loja/ze/eventos", {
        body: JSON.stringify({ event: "visit", phone: "11999999999" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ slug: "ze" }) },
    );
    expect(bad.status).toBe(400);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
