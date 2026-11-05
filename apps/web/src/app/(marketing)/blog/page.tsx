import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeading } from "../../../components/marketing/primitives";
import { POSTS } from "../../../content/posts";

const description =
  "Comparativos e soluções para quem vende delivery: comissão, cardápio digital, pagamento online e canal próprio. Um post por mês.";

export const metadata: Metadata = {
  title: "Blog",
  description,
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
  openGraph: { url: "/blog", title: "Blog · Foode Delivery", description },
};

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return (
    <section className="mk-section">
      <div className="mk-container grid gap-10">
        <SectionHeading align="left" eyebrow="Blog" lead={description}>
          Delivery próprio, sem rodeio.
        </SectionHeading>
        <ul className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug} className="mk-feature foode-outline p-6" data-reveal>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> ·{" "}
                {post.tags[0]}
              </p>
              <h2 className="mk-h3 mt-3">
                <Link
                  className="hover:text-[var(--color-primary-strong)]"
                  href={`/blog/${post.slug}`}
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
                {post.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
