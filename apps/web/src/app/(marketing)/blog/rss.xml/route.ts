// RSS 2.0 do blog, gerado dos posts versionados.
import { POSTS } from "../../../../content/posts";
import { SITE_NAME, SITE_URL } from "../../../../content/site";

export const dynamic = "force-static";

function escape(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function GET(): Response {
  const items = [...POSTS]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(
      (post) => `
    <item>
      <title>${escape(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(`${post.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${escape(post.description)}</description>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(SITE_NAME)} — Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Comparativos e soluções para quem vende delivery.</description>
    <language>pt-BR</language>${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
