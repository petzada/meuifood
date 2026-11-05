import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ids, publicMenu, storeState } from "./storefront/fixtures";

const apiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();

vi.mock("../../../lib/api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => apiFetch(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/loja/lanchonete-do-ze",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

async function render(slug = "lanchonete-do-ze") {
  const { default: StorefrontPage } = await import("./page");
  const element = await StorefrontPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(element);
}

describe("storefront /loja/[slug]", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("chama a api pelo binding com o Slug e renderiza o Cardápio do contrato", async () => {
    apiFetch.mockResolvedValue(jsonResponse(publicMenu));
    const html = await render();

    expect(apiFetch).toHaveBeenCalledWith(
      "/storefront/lojas/lanchonete-do-ze/cardapio",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(html).toContain("Lanchonete do Zé");
    expect(html).toContain("Buscar no Cardápio");
    expect(html).toContain("Destaques");
    expect(html).toContain('aria-label="Categorias"');
    expect(html).toContain("Lanches");
    expect(html).toContain("Bebidas");
    expect(html).toContain("X-Burger");
    expect(html).toContain("Pão, carne 160g e queijo.");
    expect(html).toContain("R$\u00a025,00");
    expect(html).toContain("Suco de laranja");
    expect(html).toContain("Indisponível");
    expect(html).toContain('aria-label="Compartilhar Lanchonete do Zé"');
    // O item só abre por `?item=`; sem ele, nenhum grupo de Complemento no HTML inicial.
    expect(html).not.toContain("Ponto da carne");
    // Barra do carrinho só com itens (K1).
    expect(html).not.toContain("Ver carrinho");
  });

  it("mostra o item indisponível esmaecido e sem botão", async () => {
    apiFetch.mockResolvedValue(jsonResponse(publicMenu));
    const html = await render();
    const start = html.indexOf("Suco de laranja");
    const card = html.slice(html.lastIndexOf("<li", start), start);
    expect(card).toContain('aria-disabled="true"');
    expect(card).not.toContain("<button");
  });

  it("Cardápio sem categorias mostra 'Cardápio em preparação'", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ ...publicMenu, categories: [] }));
    const html = await render();
    expect(html).toContain("Cardápio em preparação");
    expect(html).not.toContain("Buscar no Cardápio");
  });

  it("Loja inexistente ou não ativa (404) cai no not-found", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ error: "store_not_found" }, 404));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Slug inválido nem chama a api", async () => {
    await expect(render("Loja Inválida!")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("resposta fora do contrato ou 5xx vira erro de carga (error boundary)", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ name: "x" }));
    await expect(render()).rejects.toThrow("storefront_unavailable:api_contract_mismatch");
    apiFetch.mockResolvedValue(jsonResponse({ error: "not_implemented" }, 501));
    await expect(render()).rejects.toThrow("storefront_unavailable:api_status_501");
  });

  it("carrega o estado da Loja em paralelo e mostra a linha de estado (24a)", async () => {
    apiFetch.mockImplementation(async (path) =>
      path.endsWith("/estado")
        ? jsonResponse({ ...storeState, availability: { state: "paused" } })
        : jsonResponse(publicMenu),
    );
    const html = await render();
    expect(apiFetch).toHaveBeenCalledWith(
      "/storefront/lojas/lanchonete-do-ze/estado",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(html).toContain("Em pausa · pedidos voltam em breve");
    expect(html).toContain("Sobre a Loja");
  });

  it("gera o título com o nome da Loja", async () => {
    apiFetch.mockResolvedValue(jsonResponse(publicMenu));
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "lanchonete-do-ze" }),
    });
    expect(metadata.title).toBe("Lanchonete do Zé | Cardápio");
    expect(ids.burger).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
