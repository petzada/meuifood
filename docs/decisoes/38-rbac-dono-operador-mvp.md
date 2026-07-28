# Decisão: matriz RBAC dono vs operador (MVP)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #D  
**Depende de:** [11](11-planos-por-faturamento-features-completas.md), [20](20-tenant-mvp-sem-workspaces.md), [22](22-auth-lojista-e-consumidor.md), [35](35-ui-billing-plano-painel.md)

## Decisão

| Área | Dono | Operador |
| --- | --- | --- |
| Pedidos (ver / mover status) | Sim | **Sim** |
| Cardápio (CRUD / disponibilidade) | Sim | **Não** |
| Horários / funcionamento | Sim | **Não** |
| Taxas de entrega / retirada | Sim | **Não** |
| Relatórios / visão financeira | Sim | **Não** |
| Plano / billing UI | Sim | **Não** |
| Equipe (convidar / remover) | Sim | **Não** |
| Cupom / fidelidade (config) | Sim | **Não** |

Regra de produto: **operação ≠ visão financeira** e ≠ configuração da loja. Operador = fila de pedidos do dia a dia.

## Implicações

- RBAC na `api` + ocultar rotas/nav no `admin` para operador.  
- Convite de operador ([22](22-auth-lojista-e-consumidor.md)) cria membership `role = operator` em `store_id` ([36](36-tenant-store-id-canonico.md)).  
- Ampliar permissões (ex.: toggle disponibilidade) = pós-MVP ou decisão explícita depois.

## Rejeitado

- Operador editar cardápio/disponibilidade no MVP.  
- Operador ver plano, GMV/relatórios ou equipe.
