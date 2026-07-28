# Decisão: banco, ORM e multi-tenant (MVP)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #4  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md), [19](19-stack-backend-api.md), [20](20-tenant-mvp-sem-workspaces.md)  
**Pesquisa:** [11](../pesquisa/11-stack-backend-multitenant-concorrentes.md), [13](../pesquisa/13-sintese-stack-mvp.md)

## Decisão

| Item | Escolha |
| --- | --- |
| Banco | **Postgres no Supabase** (âncora [17](17-monorepo-e-infra-preferencias.md)) |
| Modelo multi-tenant | **Shared schema** + coluna **`store_id`** nas tabelas de negócio |
| Tenant MVP | 1 loja = 1 comerciante ([20](20-tenant-mvp-sem-workspaces.md)) — **sem** `workspace_id` |
| ORM | **Prisma** |
| Isolamento cross-tenant | **RLS efetivo (modo 2)** — ver abaixo |
| Schema-per-tenant | **Rejeitado** no MVP |

## Isolamento: RLS + RBAC

| Camada | Responsabilidade |
| --- | --- |
| **RLS (Postgres/Supabase)** | Impedir vazamento **entre lojas** (`store_id`); policies ativas nas connections de negócio |
| **RBAC na `api`** | **Dono vs operador** (operação ≠ financeiro); rotas e campos sensíveis |

### Como o RLS fica efetivo com Fastify + Prisma

- Requests de negócio: Prisma com role **sujeito a policies** + contexto por request (`SET LOCAL` / `set_config` com `store_id` e/ou claims).
- **`service_role` / role privilegiado:** só migrations, jobs admin e bypass **consciente** — **não** como default de toda query.
- Webhooks: auth na `api` (assinatura); escrita com role/policy adequada (sem abrir buraco cross-tenant).

## Rejeitado

- Schema-per-tenant.
- Modelar `workspace_id` no MVP.
- Confiar em RLS com **`service_role` em todas as queries** (modo 1 — teatro).
- Usar RLS no lugar do RBAC dono/operador.