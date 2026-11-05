import type { Metadata } from "next";
import Link from "next/link";

import { Calculator } from "../../components/marketing/calculator";
import { CardSpeed } from "../../components/marketing/card-speed";
import { Comparison } from "../../components/marketing/comparison";
import { CtaFinal } from "../../components/marketing/cta-final";
import { FaqSection, faqJsonLd } from "../../components/marketing/faq-section";
import { Features } from "../../components/marketing/features";
import { Founder } from "../../components/marketing/founder";
import { Hero } from "../../components/marketing/hero";
import { HowItWorks } from "../../components/marketing/how-it-works";
import { PainSection } from "../../components/marketing/pain";
import { Plans } from "../../components/marketing/plans";
import { JsonLd, SectionHeading } from "../../components/marketing/primitives";
import { FAQ } from "../../content/faq";
import { softwareApplicationJsonLd } from "../../content/json-ld";
import { SEGMENTS } from "../../content/segments";
import { SITE_DESCRIPTION, SITE_TITLE } from "../../content/site";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

// Landing (decisão 70). Ordem: hero → dor → calculadora → como funciona → funcionalidades →
// para quem → planos → taxas → comparativo → fundador → FAQ → CTA final.
export default function Home() {
  return (
    <>
      <Hero />
      <PainSection />

      <section
        aria-labelledby="calc-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading
            eyebrow="Faça a conta"
            id="calc-title"
            lead="Informe os pedidos de clientes que já conhecem a sua loja, o ticket médio e a comissão que paga hoje. A Foode mostra a mensalidade da sua faixa e o que sobra."
          >
            Quanto você deixaria de pagar por mês?
          </SectionHeading>
          <div className="mx-auto w-full max-w-4xl" data-reveal>
            <Calculator />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="como-funciona-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
        id="como-funciona"
      >
        <div className="mk-container grid gap-12">
          <SectionHeading
            align="left"
            eyebrow="Como funciona"
            id="como-funciona-title"
            lead="Sem app para o cliente, sem computador obrigatório para você."
          >
            Do link ao pedido em três passos.
          </SectionHeading>
          <HowItWorks />
        </div>
      </section>

      <section
        aria-labelledby="funcionalidades-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
        id="funcionalidades"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading
            eyebrow="Funcionalidades"
            id="funcionalidades-title"
            lead="O pacote fechado: cardápio, checkout, pagamento online, fila, cupons e relatórios. Sem módulos à parte."
          >
            Tudo que o delivery precisa. Nada que você não vai usar.
          </SectionHeading>
          <Features />
        </div>
      </section>

      <section
        aria-labelledby="para-quem-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-8">
          <SectionHeading
            eyebrow="Para quem"
            id="para-quem-title"
            lead="Se você já recebe pedidos pelo WhatsApp, Instagram ou marketplace, a Foode é o próximo passo."
          >
            Feito para quem já vende delivery.
          </SectionHeading>
          <ul className="flex flex-wrap justify-center gap-3" data-reveal>
            {SEGMENTS.map((segment) => (
              <li key={segment.slug}>
                <Link
                  className="foode-button foode-button--secondary min-h-12"
                  href={`/para/${segment.slug}`}
                >
                  {segment.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="precos-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
        id="precos"
      >
        <div className="mk-container grid gap-12">
          <SectionHeading
            eyebrow="Planos"
            id="precos-title"
            lead="Mensalidade por faixa de pedidos do mês ou um valor anual com pedidos ilimitados. Sem comissão, sem fidelidade."
          >
            Um plano. O valor acompanha seus pedidos.
          </SectionHeading>
          <Plans />
          <CardSpeed />
        </div>
      </section>

      <section
        aria-labelledby="comparativo-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container grid gap-10">
          <SectionHeading
            eyebrow="Comparativo"
            id="comparativo-title"
            lead="Só o que dá para comparar com dados públicos: mensalidade, pedidos, taxas, prazos e condições."
          >
            Como a Foode se compara.
          </SectionHeading>
          <Comparison />
        </div>
      </section>

      <section
        aria-labelledby="fundador-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <div className="mk-container">
          <Founder />
        </div>
      </section>

      <section
        aria-labelledby="faq-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
        id="faq"
      >
        <FaqSection items={FAQ}>O que todo lojista pergunta antes de começar.</FaqSection>
      </section>

      <CtaFinal />

      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqJsonLd(FAQ)} />
    </>
  );
}
