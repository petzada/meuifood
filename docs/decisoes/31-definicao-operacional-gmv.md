# Decisão: definição operacional de GMV

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #A  
**Depende de:** [30](30-grilling-lacunas-e-contrapontos.md) · **Usado por:** [32](32-taxas-e-assinatura-fixa-unica.md)

## Decisão

**GMV (mês de referência)** = soma do **total pago pelo consumidor** em pedidos com status **Concluído**, incluindo:

- itens  
- adicionais  
- taxa de delivery cobrada do consumidor  

**Meios que entram no GMV:** apenas pagamentos **online** na plataforma:

| Meio | Conta no GMV? | Escopo |
| --- | --- | --- |
| PIX online | Sim | MVP ([34](34-meios-pagamento-checkout-mvp.md)) |
| Cartão de crédito online | Sim | MVP |
| Cartão de débito online | Sim (quando existir) | Pós-MVP |
| Voucher online | Sim (quando existir) | Pós-MVP |
| Pagamento na entrega | **Não** | MVP |
| Pedidos cancelados | **Não** | — |

No MVP, GMV apurado = pedidos **Concluídos** pagos com **PIX ou crédito** (inclui itens, adicionais e taxa de delivery desses pedidos).

## Motivo

A assinatura e o teto de GMV ([32](32-taxas-e-assinatura-fixa-unica.md)) medem o volume **intermediado online** pela Foode — não o faturamento da maquininha na porta.

## Rejeitado nesta rodada

- Incluir pagamento na entrega no GMV (proposta inicial do grilling).
