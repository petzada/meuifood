# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** P → [35](35-ui-billing-plano-painel.md)  
**Método:** `/grill-with-docs`  
**Produto:** [16](16-tese-produto-fechada.md) · **Stack:** [28](28-tese-stack-mvp.md) · **Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Fechado nesta sessão

| # | Tema | Decisão |
| --- | --- | --- |
| A | GMV operacional | [31](31-definicao-operacional-gmv.md) |
| Comercial | Taxas + assinatura | [32](32-taxas-e-assinatura-fixa-unica.md) |
| L | Bandeiras crédito | [32](32-taxas-e-assinatura-fixa-unica.md) |
| N | Teto R$ 15k | [33](33-teto-gmv-comercial-fora-do-produto.md) |
| O | Meios checkout MVP | [34](34-meios-pagamento-checkout-mvp.md) |
| P | UI billing / plano | [35](35-ui-billing-plano-painel.md) |

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **B** | `store_id` canônico | Lacuna |
| C | DESIGN.md Airbnb vs primary Foode | Contraponto |
| D | Matriz dono vs operador | Lacuna |
| E | Cancelamento + estorno piloto | Lacuna |
| F | Marketing no `web` | Lacuna leve |
| G | Loja fechada / horário | Lacuna |
| H | Frete: bairro (não km) | Lacuna / contraponto |
| I | Guest → conta | Lacuna |
| J | Sem staging | Contraponto |
| K | Fidelidade MVP | Lacuna |
| M | Homologação BaaS | Comercial |

---

## Rodada atual — próxima pergunta: **B**

### B) Nome canônico do tenant no schema: `store_id`?

**Contexto:** [20](20-tenant-mvp-sem-workspaces.md) / [21](21-banco-orm-multitenant.md) ainda citam `store_id` **ou** `merchant_id`. Plano ([35](35-ui-billing-plano-painel.md)) e RLS precisam de um ID estável.

**Recomendação:** Tenant = **Loja**; coluna **`store_id`** em todas as tabelas de negócio (pedidos, cardápio, `store_members`, `plan_*`). Comerciante/Dono = membership (`role`), não entidade tenant separada no MVP.

**Por quê:** 1:1 comerciante↔loja no MVP; `merchant_id` confunde com IDs de gateway Asaas/Woovi.

---

## Fila (resumo)

**C** primary Foode (não Rausch) · **D** operador só pedidos · **E** cancel → refund_needed manual · **F** marketing no `web` · **G** cardápio visível / checkout bloqueado se fechado · **H** frete bairro ou taxa fixa · **I** guest→conta pós-pedido · **J** sem staging completo · **K** fidelidade cupom simples.

## Próximo passo

Founder responde **B**.
