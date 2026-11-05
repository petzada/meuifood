// FAQ com <details> nativo; as perguntas são as mesmas do JSON-LD FAQPage.
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

import type { FaqItem } from "../../content/faq";

export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="mx-auto max-w-3xl" data-reveal>
      {items.map((item) => (
        <details key={item.question} className="mk-faq">
          <summary>
            <span className="text-[var(--color-ink)]">{item.question}</span>
            <CaretDown
              aria-hidden
              className="mk-faq__chevron text-[var(--color-primary-strong)]"
              size={18}
              weight="bold"
            />
          </summary>
          <p className="pb-5 leading-relaxed text-[var(--color-body)]">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

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
