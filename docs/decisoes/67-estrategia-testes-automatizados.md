# 67 — Estratégia de testes automatizados

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Complementa:** spec v3 (Testing Decisions), [59](59-pivo-cloudflare-d1-workers.md)

## Já existente (mantido)

- Unitários (vitest) de regras puras; testes de rota e RPC com D1 (`@cloudflare/vitest-plugin`) **só no CI**, incluindo isolamento entre duas Lojas; prova de migrations num D1 remoto efêmero; smoke pós-deploy (`/health`, Storefront, login, bindings).

## Decidido

| Tema | Decisão |
| --- | --- |
| Testes de componente | **Testing Library + happy-dom** em `apps/web` e `apps/admin`, nos **fluxos críticos**: item com etapas, carrinho, checkout, login (Painel e Consumidor), formulários do Cardápio e do Ops, fila de Pedidos. Rodam sem banco (entram no `test:related`/pre-push). |
| E2E | **Playwright só no Ticket 30**, como planejado (smoke pós-deploy em produção com Loja sintética). |
| Acessibilidade | **axe no E2E**: violação séria nas páginas visitadas falha o smoke. |
| Cobertura | **80% de linhas em `packages/shared` e `packages/db`**, exigido no CI; apps sem meta. |
| Provedores de pagamento | **Fakes no limite HTTP + fixtures** (assinatura inválida, duplicata, reentrega, fora de ordem, Estorno); provedor real só no smoke final com PIX e cartão de valor baixo. Sem sandbox no CI. |
| Testes por propriedade | **fast-check** só em dinheiro, taxa/líquido, Estorno/Ledger e datas úteis. |
| Definição de pronto | **Como hoje**: testes a critério do agente, revisados no `/code-review` do ticket. |

## Execução

- A infraestrutura (dependências, configs de vitest, limiar de cobertura no CI) entra numa tarefa de infra de testes antes das telas do 24a; cada ticket de UI seguinte acrescenta os testes de componente dos seus fluxos críticos.
- Fluxos já entregues (Storefront do 23, Cardápio e Ops no Painel, login do Painel) ganham testes de componente na mesma tarefa de infra.
