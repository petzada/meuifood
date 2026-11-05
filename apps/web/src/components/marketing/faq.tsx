"use client";

// FAQ como acordeão de um item: botões com `aria-expanded`/`aria-controls`, a primeira
// pergunta já aberta e abrir outra fecha a anterior. Largura fixa pela coluna do grid (não
// muda ao abrir). Sem JS (antes de hidratar) todas as respostas ficam no DOM e visíveis via
// CSS (`html:not([data-mk-motion])`); as perguntas são as mesmas do JSON-LD FAQPage.
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { useId, useState } from "react";

import type { FaqItem } from "../../content/faq";

export function Faq({ items }: { items: readonly FaqItem[] }) {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <div className="mk-faq-list" data-reveal>
      {items.map((item, index) => {
        const expanded = index === open;
        const panelId = `${id}-faq-${index}`;
        const buttonId = `${id}-faq-${index}-q`;
        return (
          <div key={item.question} className="mk-faq" data-open={expanded ? "" : undefined}>
            <h3 className="m-0">
              <button
                aria-controls={panelId}
                aria-expanded={expanded}
                className="mk-faq__button"
                id={buttonId}
                onClick={() => setOpen(expanded ? -1 : index)}
                type="button"
              >
                <span className="text-[var(--color-ink)]">{item.question}</span>
                <CaretDown
                  aria-hidden
                  className="mk-faq__chevron text-[var(--color-primary-strong)]"
                  size={18}
                  weight="bold"
                />
              </button>
            </h3>
            <div
              aria-labelledby={buttonId}
              className="mk-faq__panel"
              hidden={!expanded}
              id={panelId}
              role="region"
            >
              <p className="pb-5 leading-relaxed text-[var(--color-body)]">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
