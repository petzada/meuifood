import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Faq } from "../../../../components/marketing/faq";
import { faqJsonLd } from "../../../../components/marketing/faq-section";
import { JsonLd } from "../../../../components/marketing/primitives";
import { findPost, POSTS, type PostBlock } from "../../../../content/posts";
import { LEGAL, SITE_NAME, SITE_URL } from "../../../../content/site";

type Params = Promise<{ slug: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      tags: [...post.tags],
    },
  };
}

function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "h2":
      return <h2>{block.text}</h2>;
    case "p":
      return <p>{block.text}</p>;
    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table>
          <thead>
            <tr>
              {block.head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell, i) => (
                  <td key={`${i}-${cell}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: "pt-BR",
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      legalName: LEGAL.razaoSocial,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo.png` },
    },
    keywords: post.tags.join(", "),
  };

  return (
    <article className="mk-section">
      <div className="mk-container grid gap-8">
        <header className="mx-auto grid w-full max-w-3xl gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            <Link className="hover:text-[var(--color-primary-strong)]" href="/blog">
              Blog
            </Link>{" "}
            · <time dateTime={post.publishedAt}>{post.publishedAt}</time>
          </p>
          <h1 className="mk-h1">{post.title}</h1>
          <p className="mk-lead">{post.description}</p>
          {post.reviewPending ? (
            <p className="foode-outline p-3 text-xs text-[var(--color-muted)]">
              Rascunho em revisão pelo responsável da Foode antes da publicação definitiva.
            </p>
          ) : null}
        </header>

        <div className="mx-auto w-full max-w-3xl rounded-[var(--radius-container)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-primary-strong)]">
            Resposta direta
          </p>
          <p className="mt-2 leading-relaxed text-[var(--color-ink)]">{post.answer}</p>
        </div>

        <div className="mk-prose mx-auto w-full max-w-3xl">
          {post.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <h2 className="mk-h2">Perguntas frequentes</h2>
          <div className="mt-4">
            <Faq items={post.faq} />
          </div>
        </div>
      </div>
      <JsonLd data={article} />
      <JsonLd data={faqJsonLd(post.faq)} />
    </article>
  );
}
