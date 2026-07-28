# Tese de produto — Foode Delivery (ciclo grilling concluído)

**Data:** jul/2026 · **Status:** entendimento compartilhado · **Marca:** provisional  
**Comercial vigente:** [31](31-definicao-operacional-gmv.md) · [32](32-taxas-e-assinatura-fixa-unica.md)

## Em uma frase

SaaS web **mobile-first** de canal próprio (cardápio + pedidos + gestão) para PME de delivery local: a loja traz o cliente; assinatura fixa com teto de GMV online; PIX/crédito/débito/voucher com taxas Foode; complementar ao iFood/Keeta.

## Decisões (índice)

| # | Arquivo | Tema |
| --- | --- | --- |
| 01 | [tipo produto](01-tipo-produto-saas-canal-proprio.md) | SaaS canal próprio, não marketplace |
| 02 | [ICP](02-publico-icp-pme-delivery.md) | PME que já opera delivery |
| 03 | [posicionamento](03-posicionamento-complementar-e-troca-saas.md) | Complementar marketplace + troca de SaaS |
| 04 | [receita](04-modelo-receita-saas-tiers-pagamento.md) | Estrutura SaaS + MDR (números → 32) |
| 05 | [GTM](05-escopo-geografico-e-gtm-local.md) | Cidade/região, venda consultiva, ~10 lojas |
| 06 | [gateways/taxas](06-gateways-taxas-e-tiers.md) | Histórico — **superseded** por [32](32-taxas-e-assinatura-fixa-unica.md) |
| 07 | [canal consumidor](07-canal-consumidor-web-mobile-first.md) | Link web; wa.me no MVP |
| 08 | [fulfillment](08-fulfillment-delivery-e-retirada.md) | Delivery + retirada opcional |
| 09 | [ciclo pedido](09-ciclo-pedido-status.md) | Status enxutos; iFood pós-MVP |
| 10 | [checkout/conta](10-checkout-guest-e-conta.md) | Guest + conta + fidelidade opt-in |
| 11 | [features + equipe](11-planos-por-faturamento-features-completas.md) | Features completas; dono/operador · workspaces → [20](20-tenant-mvp-sem-workspaces.md) |
| 12 | [faixas GMV](12-faixas-mensalidade-por-gmv.md) | Histórico — **superseded** por [32](32-taxas-e-assinatura-fixa-unica.md) |
| 13 | [cardápio](13-cardapio-mvp.md) | Essencial + complementos/adicionais |
| 14 | [descoberta](14-descoberta-link-e-diretorio-parceiros.md) | Link/QR MVP; diretório parceiros depois |
| 15 | [URL/marca](15-url-slug-e-marca-provisional.md) | `/loja/[slug]` · Foode Delivery |
| 31 | [GMV operacional](31-definicao-operacional-gmv.md) | Só online; exclui na entrega e cancelados |
| 32 | [taxas + assinatura](32-taxas-e-assinatura-fixa-unica.md) | Pacote comercial vigente |
| 33 | [teto GMV comercial](33-teto-gmv-comercial-fora-do-produto.md) | Sem meter/block no produto |
| 34 | [meios checkout MVP](34-meios-pagamento-checkout-mvp.md) | PIX + crédito + na entrega; débito/voucher depois |
| 35 | [UI billing plano](35-ui-billing-plano-painel.md) | Painel: plano mensal/anual; MVP flag+read-only; cobrança auto pós-MVP |

Stack / implementação: índice canônico → [28 — tese stack MVP](28-tese-stack-mvp.md).

## Números comerciais (vigentes)

| Item | Valor |
| --- | --- |
| Assinatura mensal | **R$ 179,00** (âncora até R$ 15.000 GMV online; acima = negociar **fora** do app — [33](33-teto-gmv-comercial-fora-do-produto.md)) |
| Assinatura anual | **R$ 1.718,40** (20% OFF) |
| PIX | **1,19%** D+1 (Woovi) |
| Crédito à vista | **3,29% + R$ 0,79** D+33 (Asaas, qualquer bandeira) |
| Débito | **2,19% + R$ 0,55** D+4 (Asaas) |
| Voucher | **3,89%** D+16 (Asaas) |
| URL loja | `https://foodedelivery.com.br/loja/[slug]` |

## Piloto vs escala (pagamentos cartão)

- **1º cliente:** Asaas no MEI do founder + repasse manual conforme settlement (crédito ~D+33).  
- **Novos clientes:** só após **BaaS** (ou fallback conta Asaas por lojista).

## Fora deste ciclo / grilling aberto

- Checklist fino de permissões dono vs operador.  
- Homologação BaaS (execução).  
- Lacunas [30](30-grilling-lacunas-e-contrapontos.md) (próxima: assinatura anual / ops).

Auth (magic link / provedor) → **fechado** na stack: [22](22-auth-lojista-e-consumidor.md).

**Glossário:** [`CONTEXT.md`](../../CONTEXT.md) · **ADRs:** [`docs/adr/`](../adr/).

## Pesquisa de mercado

Em `../pesquisa/` — benchmarks; pacotes antigos (PIX 1,29% D+0, faixas 129/179/229, Elo 4,49%) foram **superseded** por [31](31-definicao-operacional-gmv.md) e [32](32-taxas-e-assinatura-fixa-unica.md).
