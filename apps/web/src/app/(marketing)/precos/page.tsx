import type { Metadata } from "next";

import { Faq, faqJsonLd } from "../../../components/marketing/faq";
import { PaymentFees } from "../../../components/marketing/payment-fees";
import { Plans } from "../../../components/marketing/plans";
import { JsonLd, SectionHeading } from "../../../components/marketing/primitives";
import { FAQ } from "../../../content/faq";
import { softwareApplicationJsonLd } from "../../../content/json-ld";
import { FIRST_MONTHLY_TIER, formatBRL } from "../../../content/pricing";

const description = `Mensalidade por faixa de pedidos a partir de ${formatBRL(FIRST_MONTHLY_TIER.priceCents)}, sem comissão. Plano anual com pedidos ilimitados em até 6×. Taxas do pagamento online combinadas no cadastro.`;

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
          <div className="grid gap-6">
            <SectionHeading
              align="left"
              lead="PIX e cartão têm uma taxa Foode por transação, combinada no cadastro da loja. O pagamento na entrega não tem taxa."
            >
              Taxas do pagamento online
            </SectionHeading>
            <PaymentFees fees={null} />
          </div>
          <div className="grid gap-8">
            <SectionHeading>Perguntas sobre o plano</SectionHeading>
            <Faq items={PLAN_FAQ} />
          </div>
        </div>
      </section>
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqJsonLd(PLAN_FAQ)} />
    </>
  );
}
