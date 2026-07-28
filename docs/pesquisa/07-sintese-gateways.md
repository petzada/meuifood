# Síntese: gateways para o SaaS (jul/2026)

**Tipo:** pesquisa consolidada · **Não é decisão final**

| | Woovi | Asaas | Mercado Pago |
| --- | --- | --- | --- |
| Papel natural | **PIX** (já na tese) | **Cartão** + subcontas | **Cartão** + Checkout/OAuth |
| PIX | 0,80% (piso 0,50 / teto 5) **ou** R$ 0,85 fixo (**público**); founder: **R$ 0,80 ou 0,80% negociado** | R$ 1,99/tx (100 chave/mês grátis) | Checkout **0,99%** |
| Crédito à vista | — | **R$ 0,49 + 2,99%** · D+32 | **~3,98%** D+30 · **~4,98%** D+0 |
| Multi-loja | Split/subcontas (habilitar) | Subcontas + BaaS p/ escala | OAuth 1:1 por loja; 1:N comercial |
| MEI | Conta PJ MEI ok | Abre; escala multi-loja aperta | Recebe ok; plataforma em escala → LTDA |

## Leitura para grilling

- **PIX:** manter **Woovi** (mais barato que Asaas R$ 1,99 no ticket típico se usar % com piso ou fixo 0,85 + markup).
- **Cartão:** **Asaas** tende a ganhar em MDR e onboarding multi-loja; **MP** se o lojista já tem conta MP e aceita OAuth.
- **MEI:** ok para MVP com poucas lojas; para dezenas de lojas com split, planejar **LTDA + BaaS/homologação**.
