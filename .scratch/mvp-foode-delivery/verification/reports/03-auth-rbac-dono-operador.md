# Verificação — Ticket 03 Autenticar Dono e Operador e aplicar RBAC

- Veredito: **conforme**
- Verificado em: 2026-07-28T00:00:00-03:00 · HEAD `96410b9` · branch `cursor/auth-rbac-dono-operador-391f`
- Footprint: `apps/api/src/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/member-invitations.ts`, `apps/api/src/owner-provisioning.ts`, `apps/api/src/provision-owner.ts`, `apps/api/src/auth-rbac.test.ts`, `apps/api/src/owner-provisioning.test.ts`, `apps/api/src/store-routes.test.ts`, `packages/db/src/index.ts`, `packages/db/prisma/migrations/20260728130000_store_tenant_rls/migration.sql`, `packages/db/prisma/migrations/20260728132500_allow_admin_role_assumption/migration.sql`, `packages/db/prisma/migrations/20260728150000_staff_identity_lookup/migration.sql`, `packages/db/prisma/migrations/20260728170000_membership_cardinality/migration.sql`, `packages/shared/src/index.ts`, `apps/admin/src/app/page.tsx`, `apps/admin/src/app/page.test.tsx`, `apps/admin/src/app/team/actions.ts`, `apps/admin/src/app/team/submit-button.tsx`, `apps/admin/src/app/entrar/*`, `apps/admin/src/app/definir-senha/*`, `apps/admin/src/app/auth/confirm/route.ts`, `apps/admin/src/lib/supabase/server.ts`, `apps/admin/src/lib/supabase/proxy.ts`, `apps/admin/src/proxy.ts`, `.github/workflows/ci.yml`
- Bloqueadores: 0 · Altos: 0 · Médios: 0 · Notas: 1

## Requisitos do ticket

| # | Requisito (resumo) | Veredito | Evidência |
| --- | --- | --- | --- |
| R1 | Dono e Operador usam convite, e-mail e senha no Supabase Auth | Conforme | `apps/api/src/member-invitations.ts:36` (`auth.admin.inviteUserByEmail`), `apps/api/src/owner-provisioning.ts:12-24`, `apps/admin/src/app/entrar/actions.ts:13` (`signInWithPassword`), `apps/admin/src/app/definir-senha/actions.ts:12` (`updateUser({password})`) |
| R2 | API valida JWT/JWKS e rejeita ausente/inválido/expirado/sem membership | Conforme | `apps/api/src/auth.ts:12-26` (`createRemoteJWKSet` + `jwtVerify` com `algorithms:["ES256"]`, `audience`, `issuer`), `apps/api/src/app.ts:62-89` (`requireMembership`), testado em `apps/api/src/auth-rbac.test.ts:256-337` (sem token, assinatura/expiração/issuer/audience inválidos, sem membership) |
| R3 | `store_id` e papel derivados só da membership persistida | Conforme | `packages/db/src/index.ts:170-194` (`resolveMembershipContext` consulta `store_members` por `userId` do token; nenhuma rota lê `store_id`/`role` de header, query ou body) |
| R4 | Dono lista, convida e remove Operador sem apagar histórico | Conforme | `apps/api/src/app.ts:102-166`; `removeOperator` (`packages/db/src/index.ts:154-169`) deleta somente a linha de `store_members`, sem tabela de histórico operacional afetada (Pedidos ainda não existe — ticket 08) |
| R5 | Operador só acessa Pedidos/status; demais áreas negadas pela API | Conforme (parcial por escopo) | Todas as rotas de configuração/equipe exigem `requireMembership(..., "owner")` (`apps/api/src/app.ts:93-204`); não há rotas de Pedidos ainda (fora do escopo do ticket 03/depende do ticket 08), então só a negação é testável hoje |
| R6 | Remover Operador invalida acesso na request seguinte, mesmo com sessão emitida | Conforme | `apps/api/src/auth-rbac.test.ts:548-571` — remove membership com token do Dono e, na mesma suíte, a **mesma** sessão JWT do Operador (ainda válida) recebe 403 na request seguinte, provando resolução por request via `resolveMembershipContext`, não cache no JWT |
| R7 | Testes HTTP provam resposta + ausência de efeito persistido (RBAC negado e cross-Loja) | Conforme | `apps/api/src/auth-rbac.test.ts:358-385` (config negada ao Operador + GET do Dono confirma nome inalterado), `:443-475` (cross-Loja: 404 em GET/PATCH + GET da outra Loja confirma nome inalterado), `:521-546` (remoção cross-Loja: 404 + contexto do outro Dono intacto) |
| R8 | Esconder navegação no Painel é UX, não substitui autorização no servidor | Conforme | `apps/admin/src/app/page.tsx:56-62` esconde nav para Operador (só UX, testado em `page.test.tsx`); autorização real ocorre em `apps/api/src/app.ts` via `requireMembership`, independente da UI |

## Prova de autorização

- **RBAC negado**: os testes provam status HTTP (403/404) **e** ausência de efeito persistido, fazendo uma segunda chamada (com credencial válida do Dono) para ler o estado real depois da tentativa negada — não se limitam ao código de status (`auth-rbac.test.ts:358-385`, `:443-475`, `:521-546`).
- **Revogação**: o teste reaproveita o **mesmo** JWT já emitido para o Operador removido e prova 403 na request imediatamente seguinte à remoção, sem esperar expiração — isso demonstra que a API consulta a membership a cada request (`resolveMembershipContext` roda em uma transação nova por chamada) em vez de confiar em claim do JWT.
- **Cross-Loja**: duas Lojas sintéticas (`storeId`/`storeBId`) e dois Donos distintos provam que a membership de uma Loja não lê, não altera e não remove membership de outra Loja; a garantia é dupla — filtro explícito por `context.storeId` no código **e** RLS (`store_members_tenant_isolation`, `stores_tenant_isolation` em `packages/db/prisma/migrations/20260728130000_store_tenant_rls/migration.sql:56-74`).
- **O que não é provado neste ticket**: acesso positivo do Operador a Pedidos/status, porque a rota de Pedidos não existe ainda (ticket 08). Isso é esperado e não é lacuna do ticket 03 — a única superfície de negócio hoje (`/stores/:id`) é corretamente restrita ao Dono.
- **Runtime não privilegiado**: `assertRestrictedRuntime()` é chamado no boot (`apps/api/src/server.ts:44`) e testado para rejeitar credencial administrativa mesmo com `SET LOCAL ROLE` rebaixado (`auth-rbac.test.ts:275-279`), fechando o caso de a API rodar de fato como `postgres`/bypass RLS.

## Exceção de CI declarada

A exceção ficou **contida**. `.github/workflows/ci.yml` define exatamente `quality` (lint/typecheck/`test:quality`/build, sem segredo de banco) → `migrate` (`needs: quality`; dry-run + `supabase db push --linked` via Supabase CLI, com `test -n` fail-fast se faltar `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`) → `integration` (`needs: migrate`; `pnpm test` contra produção, com `test -n` para `BUSINESS_DATABASE_URL`/`SUPABASE_DB_PASSWORD`/`SUPABASE_POOLER_URL`). Não há job de deploy Railway, não há Postgres efêmero/Docker, não há passo de staging/preview. Comparado ao ticket `04-ci-migrations-producao.md` (que permanece `ready-for-agent` e cujos Comments descrevem exatamente esse DAG como o "supersede" da decisão 55), nenhum critério adicional do 04 foi antecipado além do necessário para quebrar a circularidade (banco único de produção, sem staging, migration não destrutiva, gate de CI verde antes de aplicar).

## Evidência de CI conferida

`gh run view 30373345419` e `gh run view 30374025911` confirmados: ambas as runs são `pull_request` na branch `cursor/auth-rbac-dono-operador-391f`, conclusão `success`, com os três jobs (`quality`, `migrate`, `integration`) marcados `✓` em ambas as execuções. A segunda run (`30374025911`) aponta para `headSha=263490a5...`, que é o commit anterior ao HEAD atual (`96410b9`); o commit final `96410b9` altera somente `issues/03-auth-rbac-dono-operador.md` e os dois relatórios internos em `verification/reports/` (`git show --stat 96410b9`), portanto não exigia nova run de CI. As runs batem com o alegado nos Comments do ticket.

## Divergências

Nenhuma divergência de severidade Bloqueador, Alto ou Médio encontrada.

### [NOTA] Nome de diretório de migration usa termo "Avoid" do glossário
- **Requisito/decisão:** `CONTEXT.md:19` — "Operador: ... _Avoid_: Atendente, colaborador, staff (salvo UI)"
- **Encontrado:** o diretório da migration aplicada em produção chama-se `staff_identity_lookup` — `packages/db/prisma/migrations/20260728150000_staff_identity_lookup/migration.sql`
- **Impacto:** nenhum impacto funcional; é só o nome do diretório de uma migration já aplicada em produção, sem contrato ativo ou código usando o termo (confirmado por busca no diff — `MembershipContext`, `TeamMemberView`, `resolveMembershipContext`, `/team/*` usam o vocabulário correto). O próprio agente identificou isso em `verification/reports/03-standards.md:7-16` e decidiu não renomear porque a migration já foi aplicada em produção (renomear quebraria a identidade rastreada em `_prisma_migrations`/histórico do Supabase CLI).
- **Correção sugerida:** nenhuma ação necessária agora; se uma migration futura precisar tocar essa área, usar vocabulário canônico (`operator`/`membership`) no nome do diretório.

## Invariantes checadas

- **Tenant `store_id` canônico:** sem `merchant_id`/`workspace_id` como tenant em nenhum arquivo do footprint; `store_members`/`stores` usam `store_id` — `packages/db/prisma/migrations/20260728130000_store_tenant_rls/migration.sql:17-19`.
- **Migrations/banco único (decisão 55):** sem Postgres local/Docker/efêmero em nenhum workflow ou script tocado; `migrate` job aplica só depois de `quality` verde; nenhuma migration nova contém `DROP TABLE`/`DROP COLUMN` com dado, `DELETE`/`TRUNCATE` de dado de negócio — as quatro migrations do período só criam tabelas/policies/roles, criam/removem índice e alteram role (`ALTER ROLE ... LOGIN`, `GRANT`); testes usam fixtures sintéticas com `runId`/`randomUUID` e cleanup verificado por `expect(residueCount).toBe(0)` (`auth-rbac.test.ts:201-211`).
- **RLS efetiva:** `stores`/`store_members` com `ENABLE`+`FORCE ROW LEVEL SECURITY` e policies `USING`/`WITH CHECK` por `app.current_store_id` (`.../20260728130000_store_tenant_rls/migration.sql:54-74`); runtime de negócio conecta como `foode_business` (não privilegiado) e o boot recusa sessão `postgres`/`BYPASSRLS` (`packages/db/src/index.ts:101-128`, testado em `auth-rbac.test.ts:275-279`). A policy adicional `store_members_identity_lookup` (`.../20260728150000_staff_identity_lookup/migration.sql`) só concede leitura da própria membership via `app.current_user_id`, setado apenas dentro da transação de `resolveMembershipContext` (`SET LOCAL`, escopo de transação) — não vaza para as demais transações de negócio.
- **Infra (Railway/Supabase/Prisma, sem Vercel/staging/Redis/WebSocket/worker sempre-on):** nenhum arquivo de infra fora do escopo foi tocado (sem `railway`/`vercel`/`redis`/`docker`/`staging` no diff).
- **Logs sem secrets:** `apps/api/src/logger.ts` (inalterado neste ticket) já redige `authorization`, `cookie`, `token`, `password`, `email`, etc.; os novos logs adicionados (`server.ts:34,46,48`) só emitem `signal`, `address` e `err` — sem token/segredo.
- **Glossário:** vocabulário `Operador`/`Dono`/`Equipe`/`membership`/`Loja` consistente em código e UI; única exceção é o nome de diretório de migration já aplicada (ver Nota acima).

## Conforme

- JWT verificado por assinatura real (JWKS remoto, ES256, issuer/audience/expiração) — não há `decode` sem `verify` em nenhum ponto do footprint.
- `store_id` e papel só saem de `resolveMembershipContext`, nunca de header/query/body do cliente; identidade ambígua (mais de uma membership) falha fechado com `membership_required`, coerente com o Comment do ticket sobre não cristalizar cardinalidade não decidida.
- RBAC aplicado no servidor (`requireMembership`) para toda rota sensível hoje existente; ocultar nav no Painel é só UX e coexiste com a autorização real na API.
- Revogação efetiva por request (não por expiração de JWT), com teste reaproveitando a mesma sessão já emitida.
- Isolamento cross-Loja provado tanto no código (filtro por `context.storeId`) quanto no banco (RLS `FORCE`), com teste HTTP dedicado.
- Onboarding do primeiro Dono (`provision:owner`) é uma operação manual fora do runtime HTTP, com rollback testado (`owner-provisioning.test.ts`), consistente com a decisão de não expor essa capacidade a clientes.
- Evidência de CI (`30373345419`, `30374025911`) confirmada por `gh run view` — três jobs verdes em ambas as runs, consistente com o alegado nos Comments.
- Exceção de CI (DAG `quality`→`migrate`→`integration`) contida ao necessário para destravar o ticket 03, sem antecipar deploy ou demais critérios do ticket 04.
