// CTA final (PROPOSTA-LANDING §2.12): bloco com fill suave da primary (`--mk-cta-bg`) e
// texto em ink, legível (contraste AA conferido em cta-final.test.tsx). Entra com clip-path
// ao chegar na viewport; formulário ao lado.
import { turnstileSiteKey } from "../../lib/turnstile";
import { LeadForm } from "./lead-form";

/** Fundo do CTA final: tom claro da primary; ink (#222) sobre ele passa de 4,5:1 (AA). */
export const CTA_FINAL_BG = "#ffd1d1";
export const CTA_FINAL_INK = "#222222";

export function CtaFinal() {
  return (
    <section aria-labelledby="contato-title" className="mk-section" id="contato">
      {/* O gatilho fica no wrapper: o Chrome aplica o clip-path ao calcular a interseção, e um
          bloco 100% cortado nunca "entra" na viewport. */}
      <div className="mk-container" data-reveal>
        <div className="mk-cta-final grid gap-8 rounded-[var(--radius-container)] border border-[var(--color-primary)] p-6 text-[var(--color-ink)] md:grid-cols-[5fr_7fr] md:items-center md:p-12">
          <div className="grid gap-4">
            <p className="mk-eyebrow">Vamos conversar</p>
            <h2 className="mk-h2" id="contato-title">
              Vamos abrir o canal próprio do seu delivery?
            </h2>
            <p className="text-lg leading-relaxed text-[var(--color-body)]">
              Conte como é a sua operação. A Foode cria a sua loja, monta o cardápio com você e
              entrega o link pronto para divulgar.
            </p>
          </div>
          <div className="rounded-[var(--radius-container)] border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink)]">
            <LeadForm source="cta-final" turnstileSiteKey={turnstileSiteKey()} />
          </div>
        </div>
      </div>
    </section>
  );
}
