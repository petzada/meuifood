// llms.txt (decisão 70): resumo do site para bots de IA generativa, gerado do conteúdo.
import { POSTS } from "../../content/posts";
import {
  ANNUAL_INSTALLMENT_CENTS,
  ANNUAL_INSTALLMENTS,
  ANNUAL_PRICE_CENTS,
  formatBRL,
  MONTHLY_TIERS,
  tierLabel,
} from "../../content/pricing";
import { SEGMENTS } from "../../content/segments";
import { LEGAL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../content/site";

export const dynamic = "force-static";

export function GET(): Response {
  const tiers = MONTHLY_TIERS.map(
    (tier) => `- ${tierLabel(tier)}/mês: ${formatBRL(tier.priceCents)}/mês`,
  ).join("\n");
  const segments = SEGMENTS.map(
    (s) => `- [${s.title}](${SITE_URL}/para/${s.slug}): ${s.description}`,
  ).join("\n");
  const posts = POSTS.map(
    (p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.description}`,
  ).join("\n");

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} é um cardápio digital com pedidos e pagamento online (PIX e cartão) para restaurantes e lojas de delivery no Brasil. O lojista paga uma mensalidade por faixa de pedidos do mês, sem comissão por pedido, e divulga o próprio link (${SITE_URL}/loja/sua-loja). Posicionamento: complementar ao marketplace, para o cliente recorrente. Operado por ${LEGAL.razaoSocial} (CNPJ ${LEGAL.cnpj}), ${LEGAL.cidade}.

## Preços

${tiers}
- Anual (pedidos ilimitados): ${ANNUAL_INSTALLMENTS}× de ${formatBRL(ANNUAL_INSTALLMENT_CENTS)} ou ${formatBRL(ANNUAL_PRICE_CENTS)} à vista
- Sem comissão por pedido; taxa Foode por transação só no pagamento online, combinada no cadastro; pagamento na entrega sem taxa
- Sem fidelidade; reembolso integral em até 7 dias; sem teste grátis

## Páginas

- [Início](${SITE_URL}/): landing com calculadora, como funciona, funcionalidades, planos, comparativo e FAQ
- [Preços](${SITE_URL}/precos)
- [Blog](${SITE_URL}/blog) (RSS: ${SITE_URL}/blog/rss.xml)
- [Termos de uso](${SITE_URL}/termos)
- [Política de privacidade](${SITE_URL}/privacidade)

## Segmentos

${segments}

## Posts

${posts}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
