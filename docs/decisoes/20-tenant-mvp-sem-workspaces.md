# Decisão: escopo de tenant no MVP (sem workspaces)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #4 (produto + modelo)  
**Supersede parcial:** seção “Multi-lojas = workspaces” e bullet de workspaces em [11](11-planos-por-faturamento-features-completas.md); menção em [12](12-faixas-mensalidade-por-gmv.md) e índice [16](16-tese-produto-fechada.md).

## Mudança de trajeto

| Antes (grilling produto #11) | Agora (MVP) |
| --- | --- |
| 1 cadastro → **N workspaces** (unidades) | **1 comerciante = 1 CNPJ = 1 unidade (loja)** |
| GMV consolidado entre unidades | GMV = faturamento **dessa** loja na plataforma |
| Operador preso a workspace(s) | Operador(es) da **única** loja do comerciante |

## Decisão (MVP)

- Tenant de dados = **loja / comerciante** (um slug, um cardápio, um painel operacional).
- **Multi-tenant** da plataforma = muitos comerciantes no mesmo Postgres (isolamento por **`store_id`** — canônico: [36](36-tenant-store-id-canonico.md)).
- **Multi-usuário** permanece: **dono** vs **operador** (operação ≠ visão financeira) — isso **não** é workspace.
- **Workspaces / multi-unidade:** **pós-MVP**, só se validação regional pedir rede/franquia.

## Implicação para o modelo de dados

- Não criar tabela/árvore de workspaces no schema do MVP.
- **`store_id`** em todo domínio de negócio; **não** usar `workspace_id` nem `merchant_id` como tenant ([36](36-tenant-store-id-canonico.md)).
- Se workspaces voltarem depois: adicionar camada unidade **sem** quebrar o tenant loja (migração consciente) — não overbuild agora.

## Mantido de [11](11-planos-por-faturamento-features-completas.md)

- Features completas em todos os planos por GMV.
- Equipe dono + operador(es).
- Cartão: piloto MEI → BaaS.
