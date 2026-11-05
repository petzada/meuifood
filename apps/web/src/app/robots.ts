import type { MetadataRoute } from "next";

import { SITE_URL } from "../content/site";

// PROPOSTA-SEO §3. Storefront (`/loja/[slug]`) indexável só com descrição e logo (noindex
// por meta); carrinho, checkout, pedido e eventos ficam fora sempre.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/loja/*/finalizar",
          "/loja/*/pedido/",
          "/loja/*/carrinho",
          "/loja/*/eventos",
          "/api/",
          "/contato/lead",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
