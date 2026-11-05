// JSON-LD `SoftwareApplication` com as ofertas (3 faixas + anual) lidas de `content/pricing`.
// Sem `aggregateRating` até existir avaliação real (PROPOSTA-SEO §4).
import { ANNUAL_PRICE_CENTS, MONTHLY_TIERS, tierLabel } from "./pricing";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

function reais(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    offers: [
      ...MONTHLY_TIERS.map((tier) => ({
        "@type": "Offer",
        name: `Mensal · ${tierLabel(tier)}`,
        price: reais(tier.priceCents),
        priceCurrency: "BRL",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: reais(tier.priceCents),
          priceCurrency: "BRL",
          billingIncrement: 1,
          unitCode: "MON",
          ...(tier.maxOrders !== null
            ? {
                eligibleQuantity: {
                  "@type": "QuantitativeValue",
                  minValue: tier.minOrders,
                  maxValue: tier.maxOrders,
                  unitText: "pedidos/mês",
                },
              }
            : {
                eligibleQuantity: {
                  "@type": "QuantitativeValue",
                  minValue: tier.minOrders,
                  unitText: "pedidos/mês",
                },
              }),
        },
      })),
      {
        "@type": "Offer",
        name: "Anual · pedidos ilimitados",
        price: reais(ANNUAL_PRICE_CENTS),
        priceCurrency: "BRL",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: reais(ANNUAL_PRICE_CENTS),
          priceCurrency: "BRL",
          billingIncrement: 1,
          unitCode: "ANN",
        },
      },
    ],
  };
}
