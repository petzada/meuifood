// Seção de FAQ reaproveitada na landing, em /precos e em /para/[segmento]: título e
// subtítulo sticky à esquerda, perguntas com largura fixa à direita (acordeão de um item).
// No celular, uma coluna, sem sticky.
import type { ReactNode } from "react";

import type { FaqItem } from "../../content/faq";
import { Faq } from "./faq";
import { SectionHeading } from "./primitives";

export function FaqSection({
  children,
  eyebrow = "Perguntas frequentes",
  id = "faq-title",
  items,
  lead = "Se a sua não estiver aqui, chame a Foode: uma pessoa responde.",
}: {
  children: ReactNode;
  eyebrow?: string;
  id?: string;
  items: readonly FaqItem[];
  lead?: string;
}) {
  return (
    <div className="mk-container mk-faq-section">
      <div className="mk-faq-section__head">
        <SectionHeading align="left" eyebrow={eyebrow} id={id} lead={lead}>
          {children}
        </SectionHeading>
      </div>
      <Faq items={items} />
    </div>
  );
}

/** JSON-LD FAQPage com as mesmas perguntas (PROPOSTA-SEO §4). */
export function faqJsonLd(items: readonly FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
