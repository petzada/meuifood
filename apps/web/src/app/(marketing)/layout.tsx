import type { ReactNode } from "react";

import { MarketingFooter } from "../../components/marketing/footer";
import { MarketingHeader } from "../../components/marketing/header";
import { MotionObserver } from "../../components/marketing/motion";
import { JsonLd } from "../../components/marketing/primitives";
import { WhatsAppFloat } from "../../components/marketing/whatsapp-float";
import { LEGAL, SITE_NAME, SITE_URL } from "../../content/site";

// Layout das páginas públicas (decisão 40): header/footer da landing, skip link, observer de
// motion e o JSON-LD `Organization` em todas as páginas. O Storefront (`/loja/*`) fica fora.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  legalName: LEGAL.razaoSocial,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo.png`,
  email: LEGAL.email,
  address: { "@type": "PostalAddress", addressLocality: LEGAL.cidade, addressCountry: "BR" },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      url: `${SITE_URL}/#contato`,
      areaServed: "BR",
      availableLanguage: "pt-BR",
    },
  ],
};

export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <a className="mk-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <MarketingHeader />
      <main id="conteudo">{children}</main>
      <MarketingFooter />
      <WhatsAppFloat />
      <MotionObserver />
      <JsonLd data={organizationJsonLd} />
    </>
  );
}
