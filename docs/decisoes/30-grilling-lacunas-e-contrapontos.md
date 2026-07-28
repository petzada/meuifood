# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** fronteira de lacunas **fechada** · **Último:** K → [45](45-cupom-conta-e-fidelidade-pos-mvp.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md) · **Brand:** [FOODE-BRAND.md](../FOODE-BRAND.md)

## Objetivo cumprido

Fechar lacunas e contrapontos pós-tese ([16](16-tese-produto-fechada.md) / [28](28-tese-stack-mvp.md)) antes do bootstrap. Âncoras de produto/stack não reabertas (exceto supersede comercial explícito em [32](32-taxas-e-assinatura-fixa-unica.md)).

## Fechado nesta sessão

| # | Decisão |
| --- | --- |
| A | [31](31-definicao-operacional-gmv.md) GMV online-only |
| Comercial | [32](32-taxas-e-assinatura-fixa-unica.md) taxas + R$ 179 |
| N | [33](33-teto-gmv-comercial-fora-do-produto.md) teto comercial |
| O | [34](34-meios-pagamento-checkout-mvp.md) PIX+crédito+na entrega |
| P | [35](35-ui-billing-plano-painel.md) UI plano read-only + flag |
| B | [36](36-tenant-store-id-canonico.md) `store_id` |
| C | [37](37-brand-foode-ui-outline-taste.md) marca + outline + taste-skill |
| D | [38](38-rbac-dono-operador-mvp.md) operador só pedidos |
| E | [39](39-cancelamento-estorno-automatico.md) estorno API |
| F | [40](40-marketing-no-apps-web.md) landing no `web` |
| G | [41](41-loja-fechada-pause-checkout.md) fechado/pausado |
| H | [42](42-taxa-delivery-bairro-ou-fixa.md) frete bairro/fixa |
| I | [43](43-guest-conta-vinculo-pedido.md) guest→conta |
| J | [44](44-producao-only-sandbox-migrations-ci.md) prod-only + CI migrations |
| K | [45](45-cupom-conta-e-fidelidade-pos-mvp.md) cupom R$/%; fidelidade N pedidos pós-MVP |

## Fora desta fronteira (comercial / paralelo)

| # | Tema | Nota |
| --- | --- | --- |
| **M** | Homologação BaaS Asaas | Execução comercial — não bloqueia piloto `pilot_platform` |

## Próximo passo do produto

Entendimento compartilhado das lacunas **confirmável**. Pronto para bootstrap de código quando o founder pedir (`to-spec` / implementação), com glossário + ADRs + decisões 31–45.
