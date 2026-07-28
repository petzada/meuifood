# Tese de produto — Foode Delivery (ciclo grilling concluído)

**Data:** jul/2026 · **Status:** entendimento compartilhado · **Marca:** provisional

## Em uma frase

SaaS web **mobile-first** de canal próprio (cardápio + pedidos + gestão) para PME de delivery local: a loja traz o cliente; mensalidade por GMV; PIX/cartão com taxas abaixo do SaaS atual do comerciante-modelo; complementar ao iFood/Keeta.

## Decisões (índice)

| # | Arquivo | Tema |
| --- | --- | --- |
| 01 | [tipo produto](01-tipo-produto-saas-canal-proprio.md) | SaaS canal próprio, não marketplace |
| 02 | [ICP](02-publico-icp-pme-delivery.md) | PME que já opera delivery |
| 03 | [posicionamento](03-posicionamento-complementar-e-troca-saas.md) | Complementar marketplace + troca de SaaS |
| 04 | [receita](04-modelo-receita-saas-tiers-pagamento.md) | Mensalidade + taxas de pagamento |
| 05 | [GTM](05-escopo-geografico-e-gtm-local.md) | Cidade/região, venda consultiva, ~10 lojas |
| 06 | [gateways/taxas](06-gateways-taxas-e-tiers.md) | Woovi PIX · Asaas cartão · números |
| 07 | [canal consumidor](07-canal-consumidor-web-mobile-first.md) | Link web; wa.me no MVP |
| 08 | [fulfillment](08-fulfillment-delivery-e-retirada.md) | Delivery + retirada opcional |
| 09 | [ciclo pedido](09-ciclo-pedido-status.md) | Status enxutos; iFood pós-MVP |
| 10 | [checkout/conta](10-checkout-guest-e-conta.md) | Guest + conta + fidelidade opt-in |
| 11 | [features + equipe](11-planos-por-faturamento-features-completas.md) | Tudo em todos os planos; dono/operador; workspaces |
| 12 | [faixas GMV](12-faixas-mensalidade-por-gmv.md) | R$ 129 / 179 / 229 |
| 13 | [cardápio](13-cardapio-mvp.md) | Essencial + complementos/adicionais |
| 14 | [descoberta](14-descoberta-link-e-diretorio-parceiros.md) | Link/QR MVP; diretório parceiros depois |
| 15 | [URL/marca](15-url-slug-e-marca-provisional.md) | `/loja/[slug]` · Foode Delivery |

## Números comerciais (vigentes)

| Item | Valor |
| --- | --- |
| Mensalidade | Até R$ 3,5k GMV → **R$ 129** · R$ 3,5–9,5k → **R$ 179** · &gt; R$ 9,5k → **R$ 229** |
| PIX ao lojista | **1,29%** D+0 (custo Woovi **0,80%** c/ piso/teto) |
| Cartão Visa/Master | **3,29% + R$ 0,69** (Asaas; D+32) |
| Cartão Elo/outros | **4,49% + R$ 0,69** |
| URL loja | `https://foodedelivery.com.br/loja/[slug]` |

## Piloto vs escala (pagamentos cartão)

- **1º cliente:** Asaas no MEI do founder + repasse manual D+32.  
- **Novos clientes:** só após **BaaS** (ou fallback conta Asaas por lojista).

## Fora deste ciclo (próximo: stack / implementação)

- Provider de auth (magic link).  
- Checklist fino de permissões.  
- Prorata/billing automático das faixas GMV.  
- Homologação BaaS (execução).  
- Confirmar tabela Elo no contrato Asaas.

## Pesquisa de mercado

Em `../pesquisa/` — benchmarks; propostas antigas (ex. PIX 1,19% / tiers por feature) foram **superseded** pelas decisões acima.
