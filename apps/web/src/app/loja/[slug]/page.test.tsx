import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("storefront /loja/[slug]", () => {
  it("renderiza categorias e itens públicos com preço formatado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          storefront: {
            name: "Cantina do Bairro",
            slug: "cantina-do-bairro",
            categories: [
              {
                id: "cat-1",
                name: "Lanches",
                items: [
                  {
                    additionals: [
                      {
                        id: "77777777-7777-4777-8777-777777777777",
                        name: "Bacon",
                        priceCents: 350,
                      },
                    ],
                    complementGroups: [
                      {
                        id: "22222222-2222-4222-8222-222222222222",
                        name: "Ponto da carne",
                        options: [
                          {
                            id: "33333333-3333-4333-8333-333333333333",
                            name: "Ao ponto",
                          },
                        ],
                        required: true,
                      },
                    ],
                    id: "item-1",
                    name: "X-Burger",
                    description: "Pão e carne",
                    priceCents: 2590,
                    imageUrl: null,
                  },
                ],
              },
            ],
          },
        }),
      })),
    );
    process.env.API_URL = "http://api.test";

    const { default: StorefrontPage } = await import("./page.js");
    const element = await StorefrontPage({
      params: Promise.resolve({ slug: "cantina-do-bairro" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Cantina do Bairro");
    expect(html).toContain("Lanches");
    expect(html).toContain("X-Burger");
    expect(html).toContain("Pão e carne");
    expect(html).toContain("Ponto da carne");
    expect(html).toContain("obrigatório");
    expect(html).toContain("Bacon");
    expect(html).toContain("Carrinho");
    expect(html).toContain("preços serão recalculados pelo servidor");
    expect(html).toContain("R$");
    expect(html).not.toContain("billingMode");
    expect(html).not.toContain("pilot_platform");

    vi.unstubAllGlobals();
  });
});
