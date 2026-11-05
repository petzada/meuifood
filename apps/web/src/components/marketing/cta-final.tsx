// CTA final (PROPOSTA-LANDING §2.12): o único bloco com fill forte (primary-strong, texto
// branco AA). Entra com clip-path ao chegar na viewport; formulário ao lado.
import { LeadForm } from "./lead-form";

export function CtaFinal() {
  return (
    <section aria-labelledby="contato-title" className="mk-section" id="contato">
      {/* O gatilho fica no wrapper: o Chrome aplica o clip-path ao calcular a interseção, e um
          bloco 100% cortado nunca "entra" na viewport. */}
      <div className="mk-container" data-reveal>
        <div className="mk-cta-final grid gap-8 rounded-[var(--radius-container)] bg-[var(--color-primary-strong)] p-6 text-[var(--color-on-primary)] md:grid-cols-[5fr_7fr] md:items-center md:p-12">
          <div className="grid gap-4">
            <p className="text-sm font-bold uppercase tracking-[0.12em] opacity-90">
              Vamos conversar
            </p>
            <h2 className="mk-h2 text-[var(--color-on-primary)]" id="contato-title">
              Vamos abrir o canal próprio do seu delivery?
            </h2>
            <p className="text-lg leading-relaxed opacity-95">
              Conte como é a sua operação. A Foode cria a sua loja, monta o cardápio com você e
              entrega o link pronto para divulgar.
            </p>
          </div>
          <div className="rounded-[var(--radius-container)] bg-[var(--color-canvas)] text-[var(--color-ink)]">
            <LeadForm source="cta-final" />
          </div>
        </div>
      </div>
    </section>
  );
}
