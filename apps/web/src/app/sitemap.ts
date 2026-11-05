import type { MetadataRoute } from "next";

import { POSTS } from "../content/posts";
import { SEGMENTS } from "../content/segments";
import { SITE_URL } from "../content/site";

// Páginas estáticas (PROPOSTA-SEO §3). Lojas indexáveis entram quando a api expuser a lista
// pública de slugs ativos com descrição e logo (TODO(31-sitemap-lojas)); até lá só as
// estáticas — nada é inventado.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/precos`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
  const segments: MetadataRoute.Sitemap = SEGMENTS.map((segment) => ({
    url: `${SITE_URL}/para/${segment.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
  const posts: MetadataRoute.Sitemap = POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${post.updatedAt}T12:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...statics, ...segments, ...posts];
}
