# Verificação — Ticket 02 Instalar Loja, `store_id` e RLS efetiva

- Veredito: **conforme**
- Verificado em: 2026-07-28T00:00:00-03:00 · HEAD `57087cc` · branch `cursor/loja-store-id-rls-391f` (checkout local, base `cursor/bootstrap-monorepo-391f`)
- Footprint: `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260728130000_store_tenant_rls/migration.sql`, `packages/db/prisma/migrations/20260728132500_allow_admin_role_assumption/migration.sql`, `packages/db/prisma/migrations/migration_lock.toml`, `packages/db/prisma.config.ts`, `packages/db/prisma/seed.ts`, `packages/db/src/seed.ts`, `packages/db/src/index.ts`, `packages/db/package.json`, `packages/db/scripts/sync-supabase-migrations.mjs`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/store-routes.test.ts`, `apps/api/.env.example`, `.env.example`, `package.json`, `README.md`, `supabase/.gitignore`, `supabase/config.toml`, `reports/02-spec.md`, `reports/02-standards.md`
- Bloqueadores: 0 · Altos: 0 · Médios: 0 · Notas: 3

## Requisitos do ticket

| # | Requisito (resumo) | Veredito | Evidência |
| --- | --- | --- | --- |
| R1 | Prisma tem ownership único de schema, migrations e client | OK | `packages/db/prisma.config.ts:1-16` declara `schema`/`migrations.path`/`seed`; `packages/db/prisma/migrations/` é a única árvore versionada — `supabase/.gitignore:9` ignora `migrations/`; `packages/db/scripts/sync-supabase-migrations.mjs:1-28` gera a representação plana consumida pela CLI a partir da árvore Prisma; `package.json:12` (`db:migrate:deploy`) roda o sync antes de `supabase db push --linked`. Commit `57087cc` removeu a cópia byte-a-byte que existia em `2137a43` (achado 1 de `reports/02-standards.md:5-7`, resolvido em `reports/02-standards.md:23-25`). |
| R2 | Loja = CNPJ/tenant, Slug globalmente único, Modo de cobrança `pilot_platform`\|`baas`\|`merchant_own_account` | OK | `packages/db/prisma/schema.prisma:10-16,25-36` (`enum BillingMode`, `Store.slug @unique`, `Store.taxId @unique`); `migration.sql:1,4-15` (`CHECK "tax_id" ~ '^[0-9]{14}$'`, `CREATE UNIQUE INDEX stores_slug_key`); `migration.sql:30-32` cria `stores_single_pilot_platform_idx` — índice único parcial `WHERE billing_mode = 'pilot_platform'`, reforçando a nível de banco que só existe um Comerciante-modelo em `pilot_platform` (excede o mínimo pedido). |
| R3 | Membership distingue Dono/Operador sem Workspace, `workspace_id` ou `merchant_id` | OK | `schema.prisma:18-23,38-50` (`enum MembershipRole { owner, operator }`, `StoreMember.storeId`); `migration.sql:17-26` (`store_members` com FK `store_id`). Busca por `workspace`/`merchant_id`/`service_role` em `packages/db/**` não retornou ocorrência. |
| R4 | Seed cria exatamente o Comerciante-modelo em `pilot_platform`, idempotente | OK | `packages/db/src/seed.ts:12-25` — `prisma.store.upsert({ where: { slug: modelMerchant.slug }, create, update })`, sem efeito duplicado em reexecução; `packages/db/prisma/seed.ts:1-9` chama `seedModelMerchant` com `DATABASE_URL` (credencial administrativa). O índice único parcial de R2 impede, a nível de banco, que uma segunda Loja `pilot_platform` seja criada por qualquer caminho. |
| R5 | Requests de negócio usam role não privilegiada sujeita a policies, com contexto `store_id` local à transação | OK (capacidade provada; ligação ao entrypoint é escopo do Ticket 03) | `packages/db/src/index.ts:49-68` (`inStoreContext`): dentro de `prisma.$transaction`, executa `SET LOCAL ROLE foode_business` (quando `assumeBusinessRole`) e `SELECT set_config('app.current_store_id', ${context.storeId}, true)` — terceiro argumento `true` = escopo de transação, sem sobreviver ao commit nem vazar entre requests do pool. `migration.sql:44-49` cria `foode_business` com `NOLOGIN NOSUPERUSER ... NOBYPASSRLS`. `apps/api/src/server.ts:1-21` chama `buildApp()` sem `businessDatabase`/`resolveStoreContext`; `apps/api/src/app.ts:50-51,90` só registra `/stores/:storeId` quando ambos são injetados — hoje, nenhuma rota de negócio está ativa em produção. Isso é decisão de escopo documentada no ticket (`## Comments`, linha 27-28: "a ligação do resolvedor autenticado ao entrypoint permanece no Ticket 03") e em `README.md:37-41`; `reports/02-standards.md:13-15` e `reports/02-spec.md:6-8` registram o mesmo achado e a mesma justificativa de não-aplicabilidade a este ticket. |
| R6 | Credencial privilegiada só para migrations e operações administrativas conscientes | OK | `.env.example:9-11` documenta a separação `DATABASE_URL` (privilegiada) vs `BUSINESS_DATABASE_URL` (RLS); `packages/db/src/index.ts:45-47` (`createAdministrativeDatabase`) é usada só por `packages/db/prisma/seed.ts:1-9` e, no teste, por `administrativeDatabase` para criar/apagar fixtures (`store-routes.test.ts:52,59,64-83,88-95`) — uso administrativo consciente, coerente com `docs/decisoes/55:16-17` ("apagar as próprias linhas sintéticas... não é apagar dados no sentido proibido"). |
| R7 | Testes contra Postgres real usam duas Lojas sintéticas e provam que uma não lê nem altera linhas da outra | OK | `apps/api/src/store-routes.test.ts:30-43` conecta no Supabase de produção via pooler + `SUPABASE_DB_PASSWORD`; `:64-83` cria `storeA` (`baas`) e `storeB` (`merchant_own_account`) com `taxId`/`slug` sintéticos únicos (`fixture-rls-*-{runId}`), evitando colidir com o Comerciante-modelo `pilot_platform`; `:119-141` prova leitura cruzada bloqueada (`GET` como A em `storeB` → 404); `:143-172` prova escrita cruzada bloqueada (`PATCH` como A em `storeB` → 404 e o `GET` subsequente como B mostra o nome original, não alterado). |
| R8 | Mock de Prisma, banco sem policies ou `service_role` não satisfazem a prova | OK | Teste não usa mocks — conecta em Postgres real; `businessDatabase = createBusinessDatabase(databaseUrl, { assumeBusinessRole: true })` (`store-routes.test.ts:60-62`) força `SET LOCAL ROLE foode_business`, role explicitamente `NOBYPASSRLS` (`migration.sql:46`), nunca `service_role`. |

## Prova de isolamento

O teste `apps/api/src/store-routes.test.ts` conecta na mesma URL de pool do Supabase de produção usada pela credencial administrativa, mas o cliente "de negócio" força `SET LOCAL ROLE foode_business` (não superusuário, `NOBYPASSRLS`) antes de cada operação, dentro da mesma transação que define `app.current_store_id` via `set_config(..., true)`. Duas Lojas sintéticas (`baas` e `merchant_own_account`, deliberadamente não `pilot_platform`, para não colidir com o índice único parcial do Comerciante-modelo) são criadas com identificadores únicos por execução (`runId` aleatório) e removidas em `afterAll`, que também confirma `residueCount === 0` por consulta independente.

O que a suíte prova, de fato:
- **Leitura cruzada bloqueada:** `GET /stores/:id` autenticado como Loja A retorna 200 para a própria Loja e 404 para a Loja B (RLS filtra a linha, não apenas a rota).
- **Escrita cruzada bloqueada e sem efeito persistido:** `PATCH /stores/:id` como Loja A em `:storeBId` retorna 404, e uma leitura subsequente como Loja B confirma que o nome permaneceu o original — não é só a resposta HTTP que falha, o estado no banco não muda.
- Role efetivamente exercitada é `foode_business` via `SET LOCAL ROLE`, não a credencial administrativa nem `service_role`.

O que a suíte **não** prova diretamente:
- Isolamento de `store_members` (tabela existe com a mesma política `FOR ALL`, mas nenhuma rota HTTP a expõe ainda — não há CRUD de equipe neste ticket).
- INSERT/DELETE isolados via HTTP (só `SELECT`/`UPDATE` são exercitados pelas duas rotas existentes; a policy é `FOR ALL` com a mesma expressão `USING`/`WITH CHECK`, então a cobertura estrutural existe, mas sem teste HTTP dedicado a INSERT/DELETE neste ticket).
- Que a credencial `BUSINESS_DATABASE_URL` real (login distinto, não `postgres` + `SET ROLE`) já está provisionada em produção — nenhuma migration cria esse login; a documentação (`README.md:37-41`, `.env.example`) descreve o requisito, mas o provisionamento em si é tarefa operacional fora do que Prisma versiona.
- Execução ao vivo da suíte contra o Supabase de produção nesta verificação — por restrição read-only desta verificação (proibido tocar o banco), a passagem foi aceita com base no diff, na lógica do teste e nas declarações de `reports/02-spec.md:33-35`/`reports/02-standards.md:41-43` (lint/typecheck/test/build verdes, dry-run remoto sem pendências), não reexecutada.

## Divergências

Nenhuma divergência classificada como Bloqueador, Alto ou Médio dentro do footprint deste ticket.

## Invariantes checadas

- **Tenant canônico:** só `store_id` como FK de tenant; nenhuma ocorrência de `workspace`, `workspace_id` ou `merchant_id` como tenant em `packages/db/**` ou `apps/api/src/**` tocados por este ticket.
- **RLS efetiva:** `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy `FOR ALL` com `USING`/`WITH CHECK` idênticos em `stores` e `store_members` (`migration.sql:54-74`); nenhuma policy `USING (true)`.
- **Role não privilegiada:** `foode_business` é `NOSUPERUSER NOBYPASSRLS`; a única concessão de bypass documentada é `GRANT foode_business TO postgres` (a credencial administrativa pode se rebaixar conscientemente via `SET ROLE`, não o contrário).
- **Modo de cobrança:** enum com exatamente os três valores esperados; `merchant_own_account` só aparece como valor de enum, sem UI, rota ou caminho de ativação neste footprint.
- **Migrations não destrutivas (decisão 55):** nenhuma `DROP TABLE`/`DROP COLUMN`/`DELETE`/`TRUNCATE` de dado de negócio nas duas migrations do ticket; ambas são aditivas.
- **Banco único de produção (decisão 55):** teste lê a URL do pooler do Supabase de produção (`store-routes.test.ts:30-43`); nenhuma referência a Postgres local, Docker, banco efêmero ou simulador no footprint.
- **Fixtures sintéticas com cleanup exato (decisão 55):** IDs são registrados imediatamente após cada `create` (corrige achado 2/3 dos relatórios de review — `store-routes.test.ts:64-83`), e `afterAll` verifica `residueCount === 0`.
- **Dinheiro/Pagamentos/Custódia:** fora do footprint de dados deste ticket (nenhuma tabela de cobrança, Pedido ou Ledger introduzida) — nada a checar além do enum de Modo de cobrança, já coberto.
- **Glossário:** nenhum termo _Avoid_ (`Workspace`, `cliente`, `usuário`, `merchant` como tenant) encontrado no footprint.
- **Logs:** teste de log já coberto no Ticket 01 (`app.test.ts`); nenhuma rota nova deste ticket loga a conexão de banco ou credenciais.

## Conforme

- Prisma continua owner único de schema/migrations/client; a representação Supabase CLI é gerada e ignorada pelo Git.
- Modelo de dados mínimo (`Store`, `StoreMember`) e enums (`BillingMode`, `MembershipRole`) batem com `docs/decisoes/36` e `docs/decisoes/38`.
- RLS é efetiva de verdade: `FORCE ROW LEVEL SECURITY`, policies `FOR ALL` cobrindo SELECT/INSERT/UPDATE/DELETE, role de negócio `NOBYPASSRLS`.
- Contexto de tenant é local à transação (`SET LOCAL ROLE` + `set_config(..., true)` dentro de `$transaction`), sem estado de sessão que sobreviva ao request.
- Seed idempotente por `upsert` de slug, reforçado por índice único parcial que impede uma segunda Loja `pilot_platform` mesmo fora do caminho do seed.
- Teste de isolamento roda contra Postgres real do Supabase de produção, usa role não privilegiada de fato, duas Lojas sintéticas com identificadores únicos, e prova leitura e escrita cruzadas bloqueadas com cleanup verificado.
- Decisão consciente e documentada de não ligar o entrypoint de produção às rotas de negócio até o Ticket 03 existir (JWT/JWKS + membership), evitando aceitar `store_id` de header/query/body como substituto de autenticação — consistente com `spec.md:138`.
- Dois relatórios de review internos (`reports/02-spec.md`, `reports/02-standards.md`) já capturaram e corrigiram, no próprio ciclo do ticket, a duplicação de migrations e o cleanup não-atômico de fixtures antes deste veredito.

## Notas para o dono

- **NOTA 1 — `assumeBusinessRole` como opt-in `false` por padrão** (`packages/db/src/index.ts:30,84,96`): `createBusinessDatabase` só executa `SET LOCAL ROLE foode_business` quando o chamador passa `assumeBusinessRole: true` explicitamente. Hoje isso é seguro porque nenhuma rota de negócio está ligada em produção (R5). Quando o Ticket 03 ligar o entrypoint, se `BUSINESS_DATABASE_URL` acabar apontando para uma credencial privilegiada sem passar essa flag, o isolamento seria silenciosamente perdido. Sugestão: quando o Ticket 03 wire isso, considerar inverter o padrão (assumir a role por default, com opt-out explícito só para o admin) ou adicionar uma asserção de startup que rejeita subir com uma `BUSINESS_DATABASE_URL` que resolva para role com `BYPASSRLS`.
- **NOTA 2 — login de runtime `BUSINESS_DATABASE_URL` não é criado por nenhuma migration:** o `GRANT foode_business TO postgres` (`20260728132500_allow_admin_role_assumption/migration.sql:4`) cobre a credencial administrativa se rebaixando via `SET ROLE` (usado no teste). Não há migration que crie e conceda `foode_business` a um login de runtime distinto e não privilegiado — o `README.md:37-41` documenta esse requisito como expectativa operacional, mas o provisionamento real do login fica fora do que Prisma versiona. Não é um requisito explícito deste ticket, mas é um item a não esquecer antes do Ticket 03 apontar `BUSINESS_DATABASE_URL` para produção.
- **NOTA 3 — verificação não reexecutou a suíte:** por restrição read-only sobre o banco de produção, esta verificação não rodou `pnpm test`/Supabase CLI para confirmar ao vivo que o teste de isolamento passa hoje. O veredito de conformidade se apoia na leitura do código, no diff entre `2137a43` e `57087cc`, e nas declarações de execução registradas em `reports/02-spec.md` e `reports/02-standards.md` (lint/typecheck/test/build verdes, dry-run remoto sem migrations pendentes, `fixture_rls_residue_count=0`).

## Resolução das notas

1. **Adiada com owner explícito no Ticket 03.** Não há rota de negócio ativa no
   entrypoint do Ticket 02 e a prova passa `assumeBusinessRole: true`. O Ticket
   03, que valida JWT/JWKS e deriva Loja/papel da membership, deve tornar a
   assunção da role obrigatória ou rejeitar credencial com bypass no startup.
2. **Adiada com owner explícito no Ticket 03.** O login não privilegiado de
   `BUSINESS_DATABASE_URL` precisa ser provisionado e validado antes de ativar
   o runtime autenticado. O Ticket 02 permanece responsável pela role
   `foode_business`, policies e rebaixamento administrativo consciente da prova.
3. **Procedural, resolvida no Ticket 02.** O harness passou a aceitar
   `SUPABASE_DB_PASSWORD` e `SUPABASE_POOLER_URL` no CI, com fallback somente
   para `.env` e `supabase/.temp/pooler-url` locais e ignorados. Ausência ou
   configuração parcial falha explicitamente; não há skip, mock ou banco local.
   A suíte foi executada de fato contra Foode Delivery em produção, passou com
   duas Lojas sintéticas e a consulta independente confirmou
   `fixture_rls_residue_count=0`. A mesma prova é executada pelo check da PR #4,
   com os Repository Actions secrets configurados manualmente.
