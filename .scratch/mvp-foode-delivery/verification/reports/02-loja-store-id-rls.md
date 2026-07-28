# Verificação — Ticket 02 Instalar Loja, `store_id` e RLS efetiva

- Veredito: **conforme**
- Verificado em: 2026-07-28T00:00:00-03:00 · HEAD `57087cc` · branch `cursor/loja-store-id-rls-391f` (checkout local, base `cursor/bootstrap-monorepo-391f`)
- Rodada: 2 (rechecagem para merge da PR #4) · Verificado em: 2026-07-28 · HEAD `170fbab` · branch `cursor/loja-store-id-rls-391f` → `master`
- Rodada: 3 (rechecagem de regressão após o ticket 03 — auth/RBAC) · Verificado em: 2026-07-28 · HEAD `8b7f080` · branch `cursor/auth-rbac-dono-operador-391f`
- Rodada: 4 (rechecagem de regressão após o ticket 04 — CI + migrations validadas) · Verificado em: 2026-07-28 · HEAD `aa1a5c2`
- Footprint (rodada 1-2): `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260728130000_store_tenant_rls/migration.sql`, `packages/db/prisma/migrations/20260728132500_allow_admin_role_assumption/migration.sql`, `packages/db/prisma/migrations/migration_lock.toml`, `packages/db/prisma.config.ts`, `packages/db/prisma/seed.ts`, `packages/db/src/seed.ts`, `packages/db/src/index.ts`, `packages/db/package.json`, `packages/db/scripts/sync-supabase-migrations.mjs`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/store-routes.test.ts`, `apps/api/.env.example`, `.env.example`, `package.json`, `README.md`, `supabase/.gitignore`, `supabase/config.toml`, `.github/workflows/ci.yml`, `reports/02-spec.md`, `reports/02-standards.md`
- Footprint adicional tocado pelo ticket 03 e reavaliado na rodada 3 (`git diff 170fbab..8b7f080`): `packages/db/src/index.ts`, `packages/db/prisma/migrations/20260728150000_staff_identity_lookup/migration.sql` (nova), `packages/db/prisma/migrations/20260728170000_membership_cardinality/migration.sql` (nova), `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/store-routes.test.ts`, `apps/api/src/auth.ts` (novo), `apps/api/src/member-invitations.ts` (novo), `.github/workflows/ci.yml`
- Footprint adicional tocado pelo ticket 04 e reavaliado nesta rodada (`git diff 8b7f080..HEAD`): `packages/db/src/index.ts`, `packages/db/scripts/sync-supabase-migrations.mjs`, `.github/workflows/ci.yml`, mais os scripts novos `packages/db/scripts/{canonical-migrations,migration-policy,production-database-url,production-state,validate-migrations,verify-production-state}.mjs` e `apps/api/scripts/preflight-production-migrations.ts` (novo, lido como contexto necessário por consumir `createTransactionalBusinessDatabase`). `apps/api/src/store-routes.test.ts`, `apps/api/src/auth-rbac.test.ts` e `packages/db/prisma/**` sem diff desde `8b7f080`.
- Bloqueadores: 0 · Altos: 0 · Médios: 0 · Notas: 4 (todas da rodada 1-3, resolvidas ou adiadas — nenhuma nova nesta rodada) — ver "O que mudou desde a rodada 3"

## Requisitos do ticket

| # | Requisito (resumo) | Veredito | Evidência |
| --- | --- | --- | --- |
| R1 | Prisma tem ownership único de schema, migrations e client | OK (mantido) | `packages/db/prisma/schema.prisma` não mudou desde `170fbab` (`git diff 170fbab -- packages/db/prisma/schema.prisma` vazio). As duas migrations novas do ticket 03 (`20260728150000_staff_identity_lookup`, `20260728170000_membership_cardinality`) só tocam índice/role/policy via SQL puro — mesmo padrão usado pelas policies RLS do próprio ticket 02, que também nunca foram representadas em `schema.prisma`. O índice criado em `150000` é revertido por `170000`, então o estado final do banco continua batendo com o `schema.prisma` versionado (sem drift). `packages/db/prisma.config.ts` e `supabase/.gitignore:9` inalterados. |
| R2 | Loja = CNPJ/tenant, Slug globalmente único, Modo de cobrança `pilot_platform`\|`baas`\|`merchant_own_account` | OK (mantido) | Nenhuma das duas migrations novas do ticket 03 toca `stores`. `stores_single_pilot_platform_idx` (criado em `20260728130000_store_tenant_rls/migration.sql:30-32`) não aparece em nenhum `DROP INDEX` do diff `170fbab..8b7f080` (`grep -rn "stores_single_pilot_platform_idx\|DROP INDEX" packages/db/prisma/migrations/` só retorna o `CREATE` original e o `DROP INDEX "store_members_user_id_key"` de `170000`, que é de outra tabela). |
| R3 | Membership distingue Dono/Operador sem Workspace, `workspace_id` ou `merchant_id` | OK (mantido) | `schema.prisma:38-50` inalterado: `@@unique([storeId, userId])` e `@@index([userId])`, sem `@@unique([userId])` isolado. `20260728150000_staff_identity_lookup/migration.sql:3` cria `store_members_user_id_key` (unique em `user_id` sozinho — uma identidade só podia estar em uma Loja); `20260728170000_membership_cardinality/migration.sql:3` a derruba (`DROP INDEX "store_members_user_id_key"`) porque o domínio ainda não decidiu cardinalidade 1:N vs 1:1 Dono-Loja. Efeito líquido sobre o baseline do ticket 02 (`170fbab`, que nunca teve esse índice) é **zero** — nem cria nem remove nenhuma garantia que o ticket 02 estabeleceu. A ausência de unicidade a nível de banco é compensada em runtime por `packages/db/src/index.ts:183` (`resolveMembershipContext`: `memberships.length === 1 ? memberships[0] : undefined` — falha fechado para `null`/403 se a identidade tiver mais de uma membership), documentado no ticket 03 (`## Comments`, "a resolução falha fechado quando uma identidade possui mais de uma membership"). |
| R4 | Seed cria exatamente o Comerciante-modelo em `pilot_platform`, idempotente | OK (mantido) | `packages/db/src/seed.ts` e `packages/db/prisma/seed.ts` fora do diff `170fbab..8b7f080`. O índice único parcial de R2 (intacto) continua impedindo uma segunda Loja `pilot_platform` por qualquer caminho, incluindo os novos endpoints de equipe do ticket 03 (que não tocam `billing_mode`). |
| R5 | Requests de negócio usam role não privilegiada sujeita a policies, com contexto `store_id` local à transação | OK (fortalecido) | `packages/db/src/index.ts:66-82` (`inStoreContext`): `SET LOCAL ROLE foode_business` agora é **incondicional** dentro do `$transaction` (a flag opt-in `assumeBusinessRole` foi removida — antes era possível chamar `createBusinessDatabase` sem assumir a role; agora é impossível). `set_config('app.current_store_id', ..., true)` continua com o terceiro argumento `true` (escopo de transação, não sobrevive ao commit, não vaza entre requests do pool) — nenhuma chamada a `set_config` com `false`/omitido em nenhum ponto novo do arquivo. `resolveMembershipContext` (`index.ts:170-193`) roda dentro do mesmo `inStoreContext`, também com `SET LOCAL ROLE` + `set_config('app.current_user_id', ..., true)` igualmente local à transação. `apps/api/src/server.ts:9-23` agora **liga o entrypoint de produção de fato**: cria `businessDatabase` a partir de `BUSINESS_DATABASE_URL` obrigatória e chama `await businessDatabase.assertRestrictedRuntime()` (`index.ts:101-128`) antes de `app.listen` — essa função roda `SET LOCAL ROLE foode_business` e lança erro de startup se `current_user !== 'foode_business'`, se `rolbypassrls` for `true`, ou se `session_user === 'postgres'`. Isso é exatamente a mitigação que a rodada 2 (NOTA 1) tinha sugerido para quando o Ticket 03 ligasse o entrypoint. |
| R6 | Credencial privilegiada só para migrations e operações administrativas conscientes | OK (mantido/fortalecido) | Nenhuma rota de negócio em `apps/api/src/app.ts` usa `createAdministrativeDatabase`, `DATABASE_URL` ou `service_role` do Postgres — todas passam por `businessDatabase` com `foode_business` via `inStoreContext`. `20260728150000_staff_identity_lookup/migration.sql:7` faz `ALTER ROLE foode_business LOGIN` (habilita login direto da role restrita, endereçando a NOTA 2 da rodada 2), sem tocar `NOSUPERUSER`/`NOBYPASSRLS` (não há `ALTER ROLE ... BYPASSRLS`/`SUPERUSER` em nenhuma migration nova — confirmado por grep). `apps/api/src/member-invitations.ts` usa `SUPABASE_SERVICE_ROLE_KEY`, mas só chama `supabase.auth.admin.*` (API de gestão de usuários do Supabase Auth) — não é uma credencial de Postgres, não executa SQL, não toca `stores`/`store_members`, fora do escopo de R6 (que é sobre a role de banco estabelecida pelo ticket 02). |
| R7 | Testes contra Postgres real usam duas Lojas sintéticas e provam que uma não lê nem altera linhas da outra | OK (mantido) | `apps/api/src/store-routes.test.ts:86-116` continua criando `storeA` (`baas`) e `storeB` (`merchant_own_account`) sintéticas via `administrativeDatabase`, agora também com `storeMember.createMany` (dono de cada Loja) — consistente com o novo fluxo de autorização por membership. `:148-170` prova leitura cruzada bloqueada (`GET` como A em `storeB` → 404); `:172-201` prova escrita cruzada bloqueada (`PATCH` como A em `storeB` → 404, `GET` subsequente como B mostra o nome original). Nenhuma asserção foi removida ou enfraquecida — comparado a `170fbab`, os `expect()` dentro dos dois `it()` são idênticos; só o setup mudou (de `resolveStoreContext` fixo por header para `verifyAccessToken` + resolução real de membership). `afterAll` (`:119-134`) preservado, com `expect(residueCount).toBe(0)`; `onDelete: Cascade` em `StoreMember.store` (`schema.prisma:45`) garante que as linhas de `store_members` criadas em `beforeAll` são removidas junto das Lojas, sem resíduo adicional. Execução real confirmada nesta rodada: CI `30376179986` (SHA `8b7f080`) — job `integration`, log mostra `apps/api test: ✓ src/store-routes.test.ts (2 tests) 5636ms`, com os dois testes (`uma Loja não lê a linha de outra Loja`, `uma Loja não altera a linha de outra Loja`) passando contra o Supabase de produção, sem `skip`. |
| R8 | Mock de Prisma, banco sem policies ou `service_role` não satisfazem a prova | OK (mantido/fortalecido) | Teste continua sem mocks, conectando em Postgres real. `businessDatabase = createBusinessDatabase(databaseUrl)` (`store-routes.test.ts:89`) — sem a flag `assumeBusinessRole`, porque agora `SET LOCAL ROLE foode_business` é sempre executado (ver R5); role continua `NOBYPASSRLS` (migration `130000:46`, não alterada pelas migrations novas). `assertRestrictedRuntime` (`index.ts:101-128`) é uma nova asserção de runtime, adicional à prova de teste, que rejeita explicitamente `session_user === 'postgres'` ou role com `bypassrls`. |

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

## O que mudou desde a rodada 1

`170fbab` ("fix: executar prova RLS na CI de produção") toca apenas
`apps/api/src/store-routes.test.ts` (função `productionDatabaseUrl`) e
`.github/workflows/ci.yml` (mais README/ticket/relatórios internos, não-código).
Nenhuma linha das duas `it()` (leitura cruzada, escrita cruzada), do `beforeAll`
(criação das duas Lojas sintéticas `baas`/`merchant_own_account`) ou do
`afterAll` (`deleteMany` + `expect(residueCount).toBe(0)`) foi alterada —
confirmado por `git diff 57087cc..170fbab -- apps/api/src/store-routes.test.ts`,
cujo único hunk está dentro de `productionDatabaseUrl` (linhas 31-69 no arquivo
atual).

**Achado factual que a rodada 1 não tinha (e que muda a leitura da Nota 3 daquela
rodada):** o CI da PR #4 no HEAD `57087cc` **estava vermelho**. `gh run view
30364379804` (SHA `57087cc`, `pull_request`, `conclusion: failure`) mostra a
prova RLS falhando com `Error: ENOENT: no such file or directory, open
'.../.env'` — porque, no runner do GitHub Actions, não existe `.env` local nem
`supabase/.temp/pooler-url` (arquivo gerado pelo link da CLI, git-ignorado). A
versão de `productionDatabaseUrl` em `57087cc` só sabia ler credenciais desses
dois arquivos locais; nunca tinha um caminho para receber segredo via `env:` do
Actions. Ou seja: a alegação da Nota 3/resolução 3 da rodada 1 ("a mesma prova
é executada pelo check da PR #4, com os Repository Actions secrets
configurados manualmente") estava **factualmente incorreta no momento em que
foi escrita** — não havia wiring de secrets no `ci.yml` de `57087cc`, e o teste
não tinha como lê-los mesmo que houvesse. A rodada 1 marcou isso como nota
processual e não bloqueador porque avaliou a lógica do teste por leitura de
código, não a execução real do CI (ver Nota 3 e a ressalva explícita da seção
"Prova de isolamento" — "não reexecutada"); em retrospecto, o CI vermelho real
seria, por si, evidência de não-conformidade da alegação de resolução, não do
requisito R7/R8 em si (que dependem da lógica do teste, íntegra desde então).

`170fbab` corrige exatamente essa lacuna: `productionDatabaseUrl` passa a ler
`SUPABASE_DB_PASSWORD`/`SUPABASE_POOLER_URL` primeiro de `process.env`
(populadas pelo `env:` novo no step `pnpm test` de `ci.yml:25-27`, a partir de
`secrets.SUPABASE_DB_PASSWORD`/`secrets.SUPABASE_POOLER_URL`), com o caminho de
arquivo local como fallback apenas para desenvolvimento (`existsSync` explícito
antes de tentar ler; se nem env nem arquivos existem, lança erro — não faz
skip). Verifiquei a execução real:

- `gh run view 30365513618` (SHA `170fbab`, `pull_request`) → `conclusion:
  success`.
- No log desse run, `apps/api test: ✓ src/store-routes.test.ts (2 tests)
  2216ms` — as duas `it()` (leitura cruzada e escrita cruzada) rodaram de fato
  contra o Supabase de produção dentro do CI (2.2s é compatível com round-trips
  de rede reais, não um mock) e passaram; nenhum teste foi contado como
  `skipped` nesse arquivo.
- `SUPABASE_DB_PASSWORD` e `SUPABASE_POOLER_URL` aparecem no log apenas como
  `***` (mascarados pelo GitHub Actions), em nenhum outro ponto do log
  aparecem em texto claro — sem vazamento de segredo.

**Veredito da mudança: a prova de isolamento foi FORTALECIDA, não enfraquecida
nem apenas mantida.** A lógica de teste (quem prova o quê) é idêntica à
rodada 1 — mesma role `foode_business`/`NOBYPASSRLS`, mesmas duas Lojas
sintéticas, mesma prova de leitura e escrita cruzadas bloqueadas, mesmo
cleanup verificado. O que mudou é que a prova passou de "existe no repo e
passaria localmente com `.env`, mas nunca rodou de fato no CI" para
"efetivamente executada e verde no gate de CI da PR", fechando exatamente o
risco que a rodada 1 sinalizou como não confirmado (Nota 3). Não há
`skipIf`/`describe.skip`/early-return condicional em nenhuma das duas versões;
`170fbab` não introduziu nenhum.

## Prontidão para merge

**Veredito: aprovado para merge.** Checagem de escopo amplo da PR #4 (28
arquivos, `gh pr view 4 --json files`), sem reverificar item a item já coberto
na rodada 1:

- **Segredos:** nenhuma connection string, senha ou chave `service_role`
  commitada. `.env.example` e `apps/api/.env.example` têm só nomes de variável
  vazios; `supabase/config.toml` usa exclusivamente placeholders `env(...)`
  para todo item sensível (`auth_token`, `secret`, `s3_access_key`/`s3_secret_key`,
  `openai_api_key`). No CI, `SUPABASE_DB_PASSWORD`/`SUPABASE_POOLER_URL`
  aparecem mascarados (`***`) no log do run verde — confirmado por inspeção
  direta do log (`gh run view 30365513618 --log`), não só por presunção de
  mascaramento do Actions.
- **Migrations:** as duas migrations do ticket (`20260728130000_store_tenant_rls`,
  `20260728132500_allow_admin_role_assumption`) são só `CREATE TYPE`, `CREATE
  TABLE`, `CREATE UNIQUE/INDEX`, `ALTER TABLE ... ADD CONSTRAINT`, `ALTER TABLE
  ... ENABLE/FORCE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE ROLE`
  condicional, `GRANT` — nenhum `DROP TABLE`/`DROP COLUMN`/`DELETE`/`TRUNCATE`
  de dado de negócio. Conforme com `docs/decisoes/55-migrations-supabase-producao-ci.md`
  ("Migrations destrutivas: Proibidas").
- **`ci.yml`:** um único job, um só runner (`ubuntu-latest`), nenhum bloco
  `services:`, nenhuma referência a Postgres local/Docker/`localhost`/porta
  `543x` — testa contra o mesmo Supabase de produção via secrets, coerente com
  "Banco: Um só... Sem Postgres local, Docker, banco efêmero" de `docs/decisoes/55`.
  A aplicação da migration em si (deploy) não está neste workflow — fica com o
  Ticket 04 (`04-ci-migrations-producao.md`, citado na própria decisão 55), fora
  do escopo do Ticket 02.
- **Vercel/staging/preview/Redis/WebSocket/SSE/worker:** única ocorrência de
  "vercel" no diff é a dependência transitiva `@sentry/vercel-edge` dentro de
  `pnpm-lock.yaml` (SDK do Sentry, não uso da plataforma Vercel); as únicas
  menções a Vercel/staging/preview/Redis/WebSocket/SSE no diff de texto estão
  em listas negativas ("Não construir", "Não entram") sendo marcadas como
  cumpridas — nenhuma feature nova nessas categorias.
- **Tenant:** nenhuma ocorrência de `workspace_id` ou `merchant_id` como chave
  de tenant no diff da PR inteira (`git diff master...170fbab | grep -in
  "workspace_id\|merchant_id"` só retorna as próprias linhas do checklist/tabela
  confirmando a ausência, não uso real).

**O que precisa acontecer antes do merge:** nada bloqueador. As duas notas
adiadas para o Ticket 03 (rebaixamento de role obrigatório por padrão; login
não privilegiado real de `BUSINESS_DATABASE_URL`) permanecem, como na rodada 1,
corretamente fora do escopo do Ticket 02 — nenhuma rota de negócio está ligada
ao entrypoint de produção ainda, então não há superfície de risco ativa por
elas hoje. Recomendação não bloqueadora: ao fechar o Ticket 02 no
`.scratch/mvp-foode-delivery/issues/02-loja-store-id-rls.md`, ajustar a
redação da entrada de 2026-07-28 sobre a resolução da Nota 3 para registrar que
o CI só passou a executar a prova de fato a partir de `170fbab` (o texto atual,
herdado de `57087cc`, lê como se a prova já estivesse verde no CI desde antes
— o que este relatório mostrou não ser o caso).

## O que mudou desde a rodada 2

Pergunta desta rodada: o Ticket 03 (auth + RBAC), que mexeu fundo em
`packages/db/src/index.ts`, `apps/api/src/server.ts`/`app.ts` e
`apps/api/src/store-routes.test.ts`, **enfraqueceu** o isolamento que o
Ticket 02 provou? Reli o diff completo `git diff 170fbab -- packages/db
apps/api/src/server.ts apps/api/src/store-routes.test.ts` (mais `app.ts` e os
dois arquivos novos `auth.ts`/`member-invitations.ts` como contexto necessário
para entender o novo entrypoint) e o estado atual de todos os arquivos
tocados.

**Veredito da mudança: o isolamento foi FORTALECIDO, não enfraquecido.**

Evidência, requisito por requisito:

- **R5 — contexto local à transação:** a flag opt-in `assumeBusinessRole`
  (rodada 2, NOTA 1) foi **removida**; `SET LOCAL ROLE foode_business`
  (`packages/db/src/index.ts:73`) agora roda incondicionalmente dentro de
  `inStoreContext`, então não existe mais um caminho de código que crie um
  `BusinessDatabase` sem assumir a role restrita. `set_config(...)` continua
  com o terceiro argumento `true` em toda ocorrência nova (`index.ts:75,
  176`) — nenhuma virou estado de sessão. Mais importante: `apps/api/src/
  server.ts:9-23` agora **liga de fato** o entrypoint de produção
  (`createBusinessDatabase(BUSINESS_DATABASE_URL)` obrigatória) e chama
  `businessDatabase.assertRestrictedRuntime()` antes de `app.listen` —
  uma asserção de startup nova (`index.ts:101-128`) que lança erro se
  `current_user !== 'foode_business'`, se a role tiver `rolbypassrls`, ou se
  `session_user === 'postgres'`. Isso é literalmente a mitigação que a NOTA 1
  da rodada 2 pediu para quando o Ticket 03 ligasse o entrypoint — não uma
  regressão, é a nota sendo resolvida.
- **R6 — credencial privilegiada restrita:** nenhuma rota de negócio nova
  (`/team/context`, `/team/members`, `/team/operators/invitations`,
  `/team/members/:membershipId` em `apps/api/src/app.ts:93-166`) usa
  `createAdministrativeDatabase`, `DATABASE_URL` ou uma role com bypass —
  todas passam pelo mesmo `businessDatabase`/`inStoreContext` de sempre. A
  migration `20260728150000_staff_identity_lookup/migration.sql:7`
  (`ALTER ROLE foode_business LOGIN`) só habilita login direto da role já
  `NOSUPERUSER NOBYPASSRLS` — não há `ALTER ROLE ... BYPASSRLS` nem
  `SUPERUSER` em nenhuma migration nova (confirmado por grep em
  `packages/db/prisma/migrations/`). `SUPABASE_SERVICE_ROLE_KEY` aparece só em
  `apps/api/src/member-invitations.ts`, e só para chamar
  `supabase.auth.admin.*` (gestão de usuários do Supabase Auth) — nunca
  executa SQL contra `stores`/`store_members`, fora do escopo de R6.
- **R7/R8 — prova de isolamento:** os dois `it()` de
  `store-routes.test.ts` (leitura cruzada, escrita cruzada) têm os mesmos
  `expect()` da rodada 2; nada foi removido, nenhum `skip`/`only`/`retry`
  foi adicionado, e o único `try/catch` no arquivo é o `try { ... } catch {}`
  já existente em `verifyAccessToken` de teste para tokens inválidos — não
  envolve as asserções da prova. O que mudou no setup: a role de negócio
  deixou de ser assumida por uma flag de teste (`assumeBusinessRole: true`) e
  passou a ser sempre assumida por padrão (mesmo efeito, agora também
  garantido em produção); e a autorização deixou de vir de um
  `resolveStoreContext` que mapeava direto Bearer→storeId (mock de
  roteamento) para passar por `verifyAccessToken` + `resolveMembershipContext`
  — uma simulação mais fiel do fluxo real (token → `userId` → membership
  resolvida via consulta protegida por RLS), o que torna a prova mais forte,
  não mais fraca. `describe(..., { timeout: 15_000 }, ...)` (novo) só amplia
  o orçamento de tempo do bloco para acomodar a latência extra de rede da
  resolução de membership — não afrouxa nenhuma asserção. Cleanup
  (`afterAll`, `expect(residueCount).toBe(0)`) inalterado; os novos registros
  de `store_members` criados em `beforeAll` são removidos automaticamente
  pelo `onDelete: Cascade` de `StoreMember.store` ao apagar as Lojas
  sintéticas — sem resíduo adicional a verificar.
  **Execução real confirmada nesta rodada** (não apenas leitura de código):
  `gh run view 30376179986` tem `headSha` = `8b7f080` (o HEAD desta
  verificação) e `conclusion: success` nos três jobs (`quality`, `migrate`,
  `integration`); o log do job `integration` mostra `apps/api test: ✓
  src/store-routes.test.ts (2 tests) 5636ms`, com as duas asserções de
  isolamento (`uma Loja não lê a linha de outra Loja`,
  `uma Loja não altera a linha de outra Loja`) passando ao vivo contra o
  Supabase de produção, sem `skipped`. O job `migrate` confirma que as duas
  migrations novas do Ticket 03 já foram aplicadas em produção
  (`Remote database is up to date` no `db push --linked --dry-run`).
- **R2/R3/R4 — cardinalidade de membership e unicidade do Comerciante
  `pilot_platform`:** a sequência `CREATE UNIQUE INDEX
  store_members_user_id_key` (`150000`) → `DROP INDEX
  store_members_user_id_key` (`170000`) se cancela: o schema.prisma nunca
  declarou essa unicidade (nem antes, nem depois — `git diff 170fbab --
  packages/db/prisma/schema.prisma` está vazio), então o efeito líquido sobre
  a garantia que o Ticket 02 estabeleceu é zero. `stores_single_pilot_
  platform_idx` (índice único parcial que garante exatamente um Comerciante
  em `pilot_platform`) não é tocado por nenhuma das duas migrations novas.
  A relaxação de cardinalidade de membership (permitir uma identidade em mais
  de uma Loja a nível de banco) é compensada em runtime por falha fechada em
  `resolveMembershipContext` (`index.ts:183`: só resolve contexto quando há
  exatamente uma membership; caso contrário retorna `null` → 403), então não
  há caminho de autorização que se beneficie da ambiguidade.
- **Migrations novas — não destrutivas:** `20260728150000_staff_identity_
  lookup/migration.sql` só tem `CREATE UNIQUE INDEX`, `ALTER ROLE ... LOGIN`
  e `CREATE POLICY`; `20260728170000_membership_cardinality/migration.sql`
  só tem `DROP INDEX` (remove uma restrição, não apaga linha nem coluna com
  dado). Nenhum `DROP TABLE`, `DROP COLUMN` com dado, `DELETE` ou `TRUNCATE`
  de dado de negócio — conforme com `docs/decisoes/55-migrations-supabase-
  producao-ci.md:14` ("Migrations destrutivas: Proibidas... sem `DROP TABLE`/
  `DROP COLUMN` com dado, sem `DELETE`/`TRUNCATE` de dados de negócio").
- **CI:** `.github/workflows/ci.yml` passou de um job único (`checks`) para
  três em série (`quality` → `migrate` → `integration`), com `migrate`
  aplicando as migrations de fato via `supabase db push --linked` (dry-run
  seguido da aplicação real) antes de `integration` rodar a suíte HTTP/RLS/
  RBAC — uma melhora estrutural sobre a rodada 2, que ainda dependia de a
  migration já estar aplicada manualmente em produção antes da CI. Isso
  reduz o risco de a suíte de isolamento rodar contra um schema desatualizado.

**Notas da rodada 2, status nesta rodada:**

- **NOTA 1 (opt-in `assumeBusinessRole`): RESOLVIDA.** A flag foi removida;
  a role é sempre assumida, e há uma asserção de startup adicional
  (`assertRestrictedRuntime`) que rejeita subir com uma credencial que não
  seja `foode_business`/`NOBYPASSRLS`.
- **NOTA 2 (login de runtime de `BUSINESS_DATABASE_URL` não provisionado por
  migration): SUBSTANCIALMENTE ENDEREÇADA.** `ALTER ROLE foode_business
  LOGIN` (migration `150000`) torna a role apta a login direto; o
  provisionamento da senha em si continua sendo um passo operacional fora do
  repositório (gate documentado no ticket 03, `## Comments`, entrada sobre
  configurar `BUSINESS_DATABASE_URL` manualmente nos GitHub Actions secrets e
  na Railway) — consistente com o que a própria NOTA 2 já esperava ("o
  provisionamento real do login fica fora do que Prisma versiona").
- **NOTA 3 (verificação não reexecutou a suíte): não se aplica mais como
  antes.** Esta verificação continua sendo read-only sobre o produto (nenhum
  comando que escreve no repo ou toca o banco foi executado), mas desta vez
  foi possível confirmar a execução real via `gh run view` — a suíte rodou de
  fato no CI no HEAD desta rodada, não é uma inferência por leitura de código.

Nenhum achado novo de severidade Bloqueador, Alto ou Médio nesta rodada.

## O que mudou desde a rodada 3

- Rodada: 4 (rechecagem de regressão após o ticket 04 — CI + migrations
  validadas) · Verificado em: 2026-07-28 · HEAD `aa1a5c2`
- Footprint desta rodada (`git diff 8b7f080..HEAD -- packages/db
  apps/api/src/store-routes.test.ts`, mais o consumidor novo do export
  refatorado como contexto necessário): `packages/db/src/index.ts`,
  `packages/db/scripts/sync-supabase-migrations.mjs` (mais os scripts novos
  `canonical-migrations.mjs`, `migration-policy.mjs`, `production-database-url.mjs`,
  `production-state.mjs`, `validate-migrations.mjs`, `verify-production-state.mjs`),
  `.github/workflows/ci.yml`, `apps/api/scripts/preflight-production-migrations.ts`
  (novo, consome `createTransactionalBusinessDatabase`). `apps/api/src/store-
  routes.test.ts` e `apps/api/src/auth-rbac.test.ts` **sem diff** desde
  `8b7f080` (`git diff 8b7f080..HEAD` vazio para os dois) — R7/R8 não têm
  nenhuma linha nova para reavaliar. `packages/db/prisma/**` também sem diff
  (nenhuma migration nova, `schema.prisma` idêntico) — R1/R2/R3/R4 do banco
  em si intocados.

Pergunta desta rodada: o Ticket 04 (CI + migrations validadas), que refatorou
`packages/db/src/index.ts` (+168/−) e reescreveu `sync-supabase-
migrations.mjs` e `ci.yml`, **enfraqueceu** o isolamento que o Ticket 02
provou?

**Veredito da mudança: o isolamento foi MANTIDO** (não fortalecido de forma
que mude o veredito de conformidade, não enfraquecido). A parte que mais se
aproxima de fortalecimento — a prova RLS/RBAC transacional no preflight de
migration — é aditiva e roda fora do runtime de produção, então não altera o
veredito de "mantido" sobre a garantia core do Ticket 02 (contexto local à
transação em produção).

Tabela de evidência atual (HEAD `aa1a5c2`) para os requisitos reavaliados:

| # | Requisito (resumo) | Veredito | Evidência atual |
| --- | --- | --- | --- |
| R1 | Prisma ownership único de schema/migrations/client | OK (mantido) | `packages/db/prisma/schema.prisma` sem diff desde `8b7f080`; zero migrations novas. `sync-supabase-migrations.mjs:31-34` só regenera `supabase/migrations` a partir de `readCanonicalMigrations()` (`canonical-migrations.mjs:5-8`, raiz fixa em `packages/db/prisma/migrations`), apagando o conteúdo antigo (`sync-supabase-migrations.mjs:24-29`) antes — nunca lê de volta. |
| R5 | Contexto `store_id` local à transação, role não privilegiada em runtime | OK (mantido) | `packages/db/src/index.ts:66-77` (`inStoreContext`) preserva `SET LOCAL ROLE foode_business` + `set_config(..., true)` byte-a-byte em efeito; refatorado para receber `Prisma.TransactionClient` já aberto em vez de abrir `$transaction`. `createBusinessDatabase` (`index.ts:205-214`, `withDatabase`) continua abrindo **uma transação nova por chamada de método** — nenhuma sessão persiste entre requests. `apps/api/src/server.ts:17-19` (sem diff) continua usando `createBusinessDatabase`, não a variante transacional nova. |
| R6 | Credencial privilegiada restrita a migrations/ops | OK (mantido) | Único novo consumidor de `createAdministrativeDatabase`/credencial privilegiada é `apps/api/scripts/preflight-production-migrations.ts:41-43` (script de CI, roda em transação com rollback). `verify-production-state.mjs:13-15` idem, só verificação read-only. Nenhuma rota de `apps/api/src/app.ts` mudou. |
| R7/R8 | Prova de isolamento HTTP contra Postgres real, sem mock | OK (mantido) | `apps/api/src/store-routes.test.ts` e `apps/api/src/auth-rbac.test.ts`: diff vazio contra `8b7f080`. Prova adicional nova e fora do escopo estrito de R7/R8: preflight transacional (`preflight-production-migrations.ts:156-198`) repete leitura/escrita cruzada e RBAC contra o schema pós-migration-pendente, com rollback garantido (`rollbackProof`, linha 201). |

Evidência, requisito por requisito (narrativa completa):

- **R5 — contexto `store_id` local à transação:** `inStoreContext`
  (`packages/db/src/index.ts:66-77`) foi refatorado para receber um
  `Prisma.TransactionClient` já aberto em vez de abrir o `$transaction`
  internamente, mas o corpo continua idêntico em efeito: `SET LOCAL ROLE
  foode_business` (linha 71) e `set_config('app.current_store_id', ...,
  true)` (linhas 72-74) — terceiro argumento `true` preservado em toda
  ocorrência, incluindo `set_config('app.current_user_id', ..., true)`
  (linha 165) dentro de `resolveMembershipContext`. Quem abre o
  `$transaction` real para o runtime de produção é
  `createBusinessDatabase` (linha 205), inalterado em comportamento
  observável: cada chamada de método (`findStore`, `updateStoreName`,
  `addOperator`, etc.) continua abrindo **um `prisma.$transaction` novo por
  chamada** (`withDatabase`, linhas 207-214, com o mesmo `{ maxWait: 15_000,
  timeout: 15_000 }` de antes) e só then constrói um
  `createTransactionalBusinessDatabase(transaction)` de uso único para essa
  transação. Não existe caminho em que duas requests HTTP compartilhem a
  mesma transação/role/`set_config` — cada request continua ganhando sua
  própria transação, seu próprio `SET LOCAL ROLE`, seu próprio `set_config`
  local, exatamente como a rodada 3 verificou. `apps/api/src/server.ts:17-19`
  (sem diff desde `8b7f080`) continua chamando `createBusinessDatabase(...)`,
  não a variante transacional — confirmado por `git diff 8b7f080..HEAD --
  apps/api/src/server.ts` vazio.
  A única consumidora nova de `createTransactionalBusinessDatabase`
  (exportada pela primeira vez em `index.ts:79`) é
  `apps/api/scripts/preflight-production-migrations.ts:146-154`, um script
  de CI que roda **dentro** de uma transação administrativa que será revertida
  (`throw rollbackProof`, linha 201; `catch` que só engole esse sentinel,
  linhas 205-207) — não é o entrypoint HTTP de produção, não fica de pé
  entre requests reais, e a role ainda é rebaixada via `SET LOCAL ROLE
  foode_business` antes de qualquer query de negócio (a query que aplica a
  migration pendente, linha 70, roda antes do rebaixamento, como credencial
  administrativa — comportamento esperado para DDL). Nenhum `set_config`
  ou `SET ROLE` sem escopo `LOCAL`/transação apareceu em nenhum arquivo do
  diff (`grep -n "set_config\|SET.*ROLE" packages/db/src/index.ts
  apps/api/scripts/preflight-production-migrations.ts` só retorna as
  ocorrências já citadas, todas com `true`/`LOCAL`).
- **R6 — credencial privilegiada restrita a migrations/ops:** nenhuma rota
  de negócio em `apps/api/src/app.ts` mudou neste diff (fora do footprint
  do ticket 04) e nenhuma passou a usar `createAdministrativeDatabase`. O
  único novo consumidor de credencial administrativa é
  `apps/api/scripts/preflight-production-migrations.ts:41-43`
  (`createAdministrativeDatabase(await productionDatabaseUrl("o
  preflight"))`) — um script de CI, não uma rota HTTP, que aplica SQL de
  migration pendente e depois se rebaixa via `SET LOCAL ROLE
  foode_business` antes de qualquer chamada à `app` de negócio. Os scripts
  novos `packages/db/scripts/verify-production-state.mjs:13-15` e
  `production-database-url.mjs` também só usam a credencial privilegiada
  (via `SUPABASE_DB_PASSWORD`/`SUPABASE_POOLER_URL`) para consultas de
  verificação de estado (histórico de migrations, resíduo de fixtures) —
  scripts de CI/ops, exatamente o uso esperado e correto por R6. `.github/
  workflows/ci.yml`: o job `migrate` (linhas 28-55) é quem recebe
  `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`/`SUPABASE_POOLER_URL` para
  `migrations:preflight`, `migrations:sync-supabase` e `supabase db push`;
  o job `integration` (linhas 57-84) roda `pnpm test` com
  `BUSINESS_DATABASE_URL` (role restrita) e só usa a credencial privilegiada
  depois, no passo `pnpm db:production:verify` (linha 80), que é
  `verify-production-state.mjs` — uma consulta read-only de verificação, não
  uma rota de negócio. `set +e`/`set -e` em torno de `pnpm test` e
  `pnpm db:production:verify` (linhas 77-84) captura os dois status e falha
  o step se qualquer um for não-zero — não é skip nem swallow de falha, os
  dois `test "$x" -eq 0` finais garantem isso.
- **R7/R8 — prova de isolamento:** `apps/api/src/store-routes.test.ts` e
  `apps/api/src/auth-rbac.test.ts` têm diff vazio contra `8b7f080` — nenhuma
  asserção, nenhum `skip`/`only`/`retry`, nenhum cleanup foi tocado pelo
  ticket 04. A prova segue idêntica à rodada 3 (fortalecida). O que existe
  de novo é uma prova *adicional*, fora do escopo de R7/R8 propriamente dito
  (que é sobre "testes" no plural genérico, satisfeito pela suíte existente):
  o preflight transacional (`apps/api/scripts/preflight-production-
  migrations.ts:156-198`) roda as mesmas categorias de asserção (leitura
  cruzada 404, escrita cruzada 404, RBAC nega Operador 403, persistência
  intacta) contra o schema **pós-migration-pendente**, antes de aplicar de
  fato via `db push` — sem `try/catch` ao redor das `assertStatus` (que
  lançam e propagam), sem skip. Isso não substitui R7/R8, mas também não os
  enfraquece; é uma camada extra de gate antes de produção, consistente com
  o requisito do próprio ticket 04 ("Migration inválida... ou quebra de
  isolamento falha antes de qualquer ação de produção").
- **R1 — Prisma como owner único de schema/migrations/client:**
  `sync-supabase-migrations.mjs` mudou de "ler `prisma/migrations/*/migration.sql`
  e copiar para `supabase/migrations/*.sql`" para "ler via
  `readCanonicalMigrations()` (`canonical-migrations.mjs:12-49`, que também
  só lê de `packages/db/prisma/migrations` — `defaultPrismaMigrationsRoot`,
  linha 5-8), validar cada uma com `validateMigrationSql` e então **apagar
  todos os `.sql` existentes em `supabase/migrations`** (linhas 24-29) antes
  de reescrevê-los a partir do canônico (linhas 31-34)." A fonte de verdade
  continua sendo exclusivamente `packages/db/prisma/migrations`; a pasta
  `supabase/migrations` é destruída e regenerada a cada execução, não lida
  de volta em nenhum ponto do script — reforça, não inverte, o ownership do
  Prisma. `packages/db/prisma/schema.prisma` não mudou (diff vazio) e
  nenhuma migration nova foi adicionada pelo ticket 04 (`git diff
  8b7f080..HEAD --stat -- packages/db/prisma` vazio).

**Notas anteriores:** nenhuma das notas das rodadas 1-3 foi reaberta; nenhuma
nota nova qualifica como Bloqueador/Alto/Médio nesta rodada.

**Achado NOTA (não bloqueador):** `apps/api/scripts/preflight-production-
migrations.ts` e os scripts novos em `packages/db/scripts/` ficaram fora do
footprint literal citado no ticket para esta rodada (`packages/db/src/index.ts`,
`packages/db/scripts/sync-supabase-migrations.mjs`, `.github/workflows/ci.yml`),
mas foram lidos como contexto necessário porque consomem diretamente o export
novo `createTransactionalBusinessDatabase` de `packages/db/src/index.ts` — sem
essa leitura não seria possível confirmar que o único uso dessa função fora do
próprio `index.ts` é um script de CI transacional com rollback, não uma rota
de negócio. Isso é uma nota de método desta verificação, não uma divergência
de conformidade.

Nenhum achado novo de severidade Bloqueador, Alto ou Médio nesta rodada.
