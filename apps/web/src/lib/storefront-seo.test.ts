import { describe, expect, it } from "vitest";

import { isStorefrontIndexable, storefrontMetadata } from "./storefront-seo";

const full = {
  description:
    "Hamburgueria artesanal no centro, com smash, batata rústica e milk-shake de verdade.",
  logoUrl: "https://api.foodedelivery.com.br/media/stores/x/brand/logo.webp",
  coverUrl: "https://api.foodedelivery.com.br/media/stores/x/brand/cover.webp",
};

describe("SEO do Storefront", () => {
  it("indexa só com descrição (>= 60) e logo", () => {
    expect(isStorefrontIndexable(full)).toBe(true);
    expect(isStorefrontIndexable({ ...full, logoUrl: null })).toBe(false);
    expect(isStorefrontIndexable({ ...full, description: "Curta" })).toBe(false);
    expect(isStorefrontIndexable(undefined)).toBe(false);
  });

  it("monta OG com a capa e canônica própria", () => {
    const meta = storefrontMetadata("burger-x", "Burger X", full);
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/loja/burger-x");
    expect(meta.openGraph).toMatchObject({
      url: "/loja/burger-x",
      images: [{ url: full.coverUrl }],
    });
    expect(meta.description).toBe(full.description);
  });

  it("sem vitrine: noindex, descrição padrão e sem imagem", () => {
    const meta = storefrontMetadata("loja", "Loja", undefined);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.description).toContain("Loja");
    expect(meta.openGraph).not.toHaveProperty("images");
  });
});
