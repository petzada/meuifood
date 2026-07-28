# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** O → [34](34-meios-pagamento-checkout-mvp.md)  
**Método:** `/grill-with-docs`  
**Produto:** [16](16-tese-produto-fechada.md) · **Stack:** [28](28-tese-stack-mvp.md) · **Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Objetivo

Fechar lacunas e contrapor decisões soft antes do bootstrap.

## Âncoras (atualizadas)

… · **checkout MVP = PIX + crédito + na entrega** ([34](34-meios-pagamento-checkout-mvp.md); débito/voucher pós-MVP) · teto R$ 15k comercial fora do app ([33](33-teto-gmv-comercial-fora-do-produto.md)) · …

## Fechado nesta sessão

| # | Tema | Decisão |
| --- | --- | --- |
| **A** | GMV operacional | [31](31-definicao-operacional-gmv.md) |
| **Comercial** | Taxas + assinatura | [32](32-taxas-e-assinatura-fixa-unica.md) |
| **L** | Bandeiras crédito | Mesma tabela ([32](32-taxas-e-assinatura-fixa-unica.md)) |
| **N** | Teto R$ 15k | [33](33-teto-gmv-comercial-fora-do-produto.md) |
| **O** | Meios checkout MVP | [34](34-meios-pagamento-checkout-mvp.md) |

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **P** | Cobrança da assinatura (mensal/anual) no produto | Lacuna leve |
| B | `store_id` canônico | Lacuna |
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

## Rodada atual — próxima pergunta: **P**

### P) A assinatura (R$ 179 mensal ou R$ 1.718,40 anual) aparece de alguma forma no produto?

**Contexto:** [32](32-taxas-e-assinatura-fixa-unica.md) define os valores; [33](33-teto-gmv-comercial-fora-do-produto.md) coloca preço/teto/liberação **fora** da plataforma. Ainda falta dizer se o admin mostra “seu plano”, cobrança self-serve, ou zero UI de billing.

**Recomendação:** **Zero UI de billing/assinatura no MVP.**

- Cobrança mensal ou anual = **ops comercial** (PIX/boleto Foode, planilha, o que for).  
- Liberar/desligar loja = ação ops (flag `store.active`), não portal de assinatura.  
- Painel do dono: **sem** tela de plano, fatura Foode ou upgrade anual.  
- Relatórios = negócio do delivery (pedidos, ticket, etc.), não “status da mensalidade Foode”.

Alinha ao foco “gestão de delivery e cardápio” e evita construir billing SaaS antes de validar o piloto.

**Alternativa:** tela read-only “Plano: Foode · R$ 179” sem cobrança — pouco valor, mais superfície.

---

## Fila (resumo)

**B** `store_id` · **C** primary Foode · **D** RBAC · **E** cancel/refund · **F–K** marketing / horário / frete bairro / guest→conta / staging / fidelidade.

## Próximo passo

Founder responde **P**.
