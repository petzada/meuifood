# Decisão: meios de pagamento no checkout MVP

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #O  
**Depende de:** [32](32-taxas-e-assinatura-fixa-unica.md) · **Arquitetura:** [24](24-arquitetura-pagamentos.md)

## Decisão (MVP / dia 1)

| Meio | Gateway | MVP |
| --- | --- | --- |
| **PIX online** | Woovi | **Sim** |
| **Crédito à vista** | Asaas | **Sim** |
| **Pagamento na entrega** | — (maquininha/dinheiro do lojista) | **Sim** |
| **Débito online** | Asaas | **Pós-MVP** |
| **Voucher online** | Asaas | **Pós-MVP** |

Taxas comerciais de débito/voucher em [32](32-taxas-e-assinatura-fixa-unica.md) permanecem como **tabela futura** — não entram no checkout, schema obrigatório de cobrança nem QA do piloto.

## Implicações

- Checkout e `payments`: providers **`woovi` (PIX)** + **`asaas` (crédito)** + fluxo **na entrega** sem charge.  
- Enum/API do MVP: `pix` | `credit` | `on_delivery` (nomes técnicos na implementação).  
- Débito/voucher: **não** modelar como flag “off” no MVP — fica fora do escopo de build até pós-MVP.  
- GMV ([31](31-definicao-operacional-gmv.md)): no MVP = pedidos concluídos pagos com **PIX ou crédito** (+ taxa delivery nesses pedidos). Quando débito/voucher existirem, entram na mesma regra “só online”.

## Rejeitado nesta rodada

- Shipar débito e voucher no dia 1.  
- Deixar débito/voucher como flag off no piloto (escopo pós-MVP é mais limpo).
