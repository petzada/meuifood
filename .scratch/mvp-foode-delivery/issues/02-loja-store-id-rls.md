# 02 — Instalar Loja, `store_id` e RLS efetiva

**What to build:** O Postgres recebe o modelo mínimo de Loja e membership, com Prisma como owner do schema, `store_id` canônico, RLS efetiva e seed idempotente do único Comerciante-modelo em `pilot_platform`.

**Blocked by:** 01 — Bootstrapar monorepo e identidade Foode.

**Status:** ready-for-agent

- [ ] Prisma possui ownership único de schema, migrations e client.
- [ ] Loja representa um CNPJ/tenant e possui Slug globalmente único e Modo de cobrança `pilot_platform`, `baas` ou `merchant_own_account`.
- [ ] Membership distingue Dono e Operador sem introduzir Workspace, `workspace_id` ou `merchant_id` como tenant.
- [ ] O seed cria exatamente o Comerciante-modelo em `pilot_platform` e pode ser executado novamente sem duplicação.
- [ ] Requests de negócio usam uma role não privilegiada, sujeita às policies, com contexto `store_id` local à transação.
- [ ] Credencial privilegiada fica restrita a migrations e operações administrativas conscientes.
- [ ] Testes contra Postgres real usam duas Lojas sintéticas e provam que uma não lê nem altera linhas da outra.
- [ ] Mock de Prisma, banco sem policies ou `service_role` padrão não satisfazem a prova de isolamento.

