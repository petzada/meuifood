import { Button } from "@foode/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { Calculator } from "../../../../components/marketing/calculator";
import { Faq, faqJsonLd } from "../../../../components/marketing/faq";
import { LeadForm } from "../../../../components/marketing/lead-form";
import { Plans } from "../../../../components/marketing/plans";
import { JsonLd, RefundLine, SectionHeading } from "../../../../components/marketing/primitives";
import { findSegment, SEGMENTS } from "../../../../content/segments";
import { SITE_NAME, SITE_URL } from "../../../../content/site";
import { turnstileSiteKey } from "../../../../lib/turnstile";

type Params = Promise<{ segmento: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return SEGMENTS.map((segment) => ({ segmento: segment.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { segmento } = await params;
  const segment = findSegment(segmento);
  if (!segment) return {};
  return {
    title: segment.title,
    description: segment.description,
    alternates: { canonical: `/para/${segment.slug}` },
    openGraph: {
      url: `/para/${segment.slug}`,
      title: `${segment.title} · ${SITE_NAME}`,
      description: segment.description,
    },
  };
}

// /para/[segmento] (decisão 70): conteúdo próprio por nicho + calculadora com exemplo do
// nicho, planos, FAQ própria e formulário. Breadcrumb no JSON-LD.
export default async function SegmentPage({ params }: { params: Params }) {
  const { segmento } = await params;
  const segment = findSegment(segmento);
  if (!segment) notFound();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: segment.name,
        item: `${SITE_URL}/para/${segment.slug}`,
      },
    ],
  };

  return (
    <>
      <section className="mk-section">
        <div className="mk-container grid gap-6">
          <p className="mk-eyebrow" data-reveal>
            Cardápio digital para {segment.name.toLowerCase()}
          </p>
          <h1 className="mk-h1 max-w-4xl" data-reveal>
            {segment.h1}
          </h1>
          <p className="mk-lead max-w-3xl" data-reveal>
            {segment.intro}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-reveal>
            <Button href="#contato">Falar com a Foode</Button>
            <RefundLine />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="dores-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10 md:grid-cols-[5fr_7fr] md:gap-16">
          <SectionHeading align="left" eyebrow="O que trava hoje" id="dores-title">
            O que a {segment.name.toLowerCase()} enfrenta no delivery.
          </SectionHeading>
          <ul className="grid gap-3">
            {segment.pains.map((pain, i) => (
              <li
                key={pain}
                className="foode-outline p-5 leading-relaxed text-[var(--color-body)]"
                data-reveal
                style={{ "--reveal-i": i } as CSSProperties}
              >
                {pain}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="solucoes-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading eyebrow="Como a Foode resolve" id="solucoes-title">
            Funcionalidades que já existem, pensadas para {segment.name.toLowerCase()}.
          </SectionHeading>
          <div className="grid gap-4 md:grid-cols-3">
            {segment.solutions.map((solution, i) => (
              <article
                key={solution.title}
                className="mk-feature foode-outline p-6"
                data-reveal
                style={{ "--reveal-i": i } as CSSProperties}
              >
                <h3 className="mk-h3">{solution.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
                  {solution.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="calc-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading
            eyebrow="Faça a conta"
            id="calc-title"
            lead={`Exemplo de ${segment.name.toLowerCase()}: ${segment.example.ordersPerMonth} pedidos recorrentes por mês. Troque pelos seus números.`}
          >
            Quanto você deixaria de pagar por mês?
          </SectionHeading>
          <div className="mx-auto w-full max-w-4xl" data-reveal>
            <Calculator
              initialOrders={segment.example.ordersPerMonth}
              initialTicketCents={segment.example.averageTicketCents}
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="planos-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading eyebrow="Planos" id="planos-title">
            Um plano. O valor acompanha seus pedidos.
          </SectionHeading>
          <Plans ctaHref="#contato" />
        </div>
      </section>

      <section
        aria-labelledby="faq-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading eyebrow="Perguntas" id="faq-title">
            Dúvidas de quem tem {segment.name.toLowerCase()}.
          </SectionHeading>
          <Faq items={segment.faq} />
        </div>
      </section>

      <section
        aria-labelledby="contato-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
        id="contato"
      >
        <div className="mk-container grid gap-10 md:grid-cols-[5fr_7fr] md:items-start">
          <SectionHeading
            align="left"
            id="contato-title"
            lead="Conte como é a sua operação e a Foode cria a sua loja com você."
          >
            Vamos abrir o canal próprio da sua {segment.name.toLowerCase()}?
          </SectionHeading>
          <div data-reveal>
            <LeadForm source={`para/${segment.slug}`} turnstileSiteKey={turnstileSiteKey()} />
          </div>
        </div>
      </section>

      <JsonLd data={breadcrumb} />
      <JsonLd data={faqJsonLd(segment.faq)} />
    </>
  );
}
