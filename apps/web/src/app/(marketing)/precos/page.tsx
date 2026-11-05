import type { Metadata } from "next";

import { CardSpeed } from "../../../components/marketing/card-speed";
import { Comparison } from "../../../components/marketing/comparison";
import { FaqSection, faqJsonLd } from "../../../components/marketing/faq-section";
import { Plans } from "../../../components/marketing/plans";
import { JsonLd, SectionHeading } from "../../../components/marketing/primitives";
import { FAQ } from "../../../content/faq";
import { softwareApplicationJsonLd } from "../../../content/json-ld";
import { FIRST_MONTHLY_TIER, formatBRL } from "../../../content/pricing";

const description = `Mensalidade por faixa de pedidos a partir de ${formatBRL(FIRST_MONTHLY_TIER.priceCents)}, sem comissão. Plano anual com pedidos ilimitados em até 6×. Cartão com modo rápido para receber em 1 dia útil.`;

export const metadata: Metadata = {
  title: "Preços",
  description,
  alternates: { canonical: "/precos" },
  openGraph: { url: "/precos", title: "Preços · Foode Delivery", description },
};

const PLAN_FAQ = FAQ.filter((item) =>
  [
    "Tem taxa por pedido?",
    "Tem fidelidade ou multa?",
    "Tem teste grátis?",
    "Como pago a mensalidade?",
  ].includes(item.question),
);

// /precos (decisão 71): a página que a venda envia; mesmo conteúdo da seção de planos.
export default function PricingPage() {
  return (
    <>
      <section className="mk-section">
        <div className="mk-container grid gap-12">
          <SectionHeading
            eyebrow="Planos"
            lead="Mensalidade por faixa de pedidos do mês ou um valor anual com pedidos ilimitados. Sem comissão por pedido, sem fidelidade."
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
        aria-labelledby="faq-title"
        className="mk-section border-t border-[var(--color-hairline-soft)]"
      >
        <FaqSection
          eyebrow="Perguntas"
          items={PLAN_FAQ}
          lead="O que mais perguntam sobre mensalidade, anual e cancelamento."
        >
          Perguntas sobre o plano
        </FaqSection>
      </section>
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqJsonLd(PLAN_FAQ)} />
    </>
  );
}
