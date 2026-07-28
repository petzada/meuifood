# Verificação — Ticket 04 Bloquear produção com CI e migrations validadas

- Veredito: **divergências**
- Verificado em: 2026-07-28T18:00:00-03:00 · HEAD `f80718d` · PR #6
- Footprint: `packages/db/scripts/migration-policy.mjs`, `packages/db/scripts/migration-policy.test.mjs`, `apps/api/scripts/preflight-production-migrations.ts`, `apps/api/scripts/migration-preflight-policy.mjs`, `packages/db/scripts/production-database-url.mjs`, `packages/db/scripts/verify-production-state.mjs`, `packages/db/scripts/production-state.mjs`, `packages/db/scripts/canonical-migrations.mjs`, `packages/db/scripts/sync-supabase-migrations.mjs`, `.github/workflows/ci.yml`, `packages/db/src/index.ts`, `docs/decisoes/55-migrations-supabase-producao-ci.md`, `docs/decisoes/44-producao-only-sandbox-migrations-ci.md`, `docs/decisoes/25-hospedagem-ci-ops.md`, `README.md`
- Bloqueadores: 0 · Altos: 1 · Médios: 1 · Notas: 2

## Método

Além da leitura estática do desenho, o `validateMigrationSql` foi executado
diretamente (import ESM, sem tocar banco/repo) contra ~22 vetores de ataque —
incluindo os oito listados no prompt de verificação — para confirmar
empiricamente, e não apenas por leitura de regex, o que a política aceita e
rejeita. O script de prova está em
`C:\Users\MARCIO~1.PET\AppData\Local\Temp\claude\...\scratchpad\probe-policy.mjs`
(fora do produto, não commitado). Resultado bruto reproduzido abaixo nas
seções relevantes. Também consultei o GitHub ao vivo (`gh pr view 6`, `gh api
.../branches/master/protection`) para checar o estado real do PR e confirmar o
403 de branch protection citado no ticket.

## Requisitos do ticket

| # | Requisito (resumo, já corrigido) | Veredito | Evidência |
| --- | --- | --- | --- |
| R1 | Workflow instala pelo lockfile e roda lint/typecheck/testes/build dos workspaces relevantes | Conforme | `.github/workflows/ci.yml:21-26` (`pnpm install --frozen-lockfile`, `db:migrations:validate`, `lint`, `typecheck`, `test:quality`, `build`) |
| R2 (corrigido) | Sem Postgres descartável; CI aplica migrations e prova RLS/RBAC contra o Supabase de produção, role não privilegiada, fixtures sintéticas, cleanup exato e verificado | Conforme, com ressalva ALTA na política (ver seção própria) | `apps/api/scripts/preflight-production-migrations.ts:41-222` roda contra `productionDatabaseUrl` (Supabase real); prova HTTP usa `SET LOCAL ROLE foode_business` (`packages/db/src/index.ts:71,95`); cleanup verificado em dois níveis — teste (`apps/api/src/auth-rbac.test.ts:201-211`, `store-routes.test.ts:119-129`) e verificador independente (`packages/db/scripts/verify-production-state.mjs:23-37`) |
| R3 | Migration inválida, drift ou quebra de isolamento falha antes de qualquer ação de produção | Conforme | `pendingCanonicalMigrations` exige que o histórico remoto seja prefixo exato (`apps/api/scripts/migration-preflight-policy.mjs:1-11`); `assertIsolationCatalog` barra role com bypass/superuser/RLS não forçada (`migration-preflight-policy.mjs:13-33`); passos do job `migrate` rodam em `bash -e` — qualquer falha aborta antes de `supabase db push` (`.github/workflows/ci.yml:44-55`) |
| R4 (corrigido) | Quem aplica é GitHub Actions via Supabase CLI; `web`/`admin`/`api` não aplicam migration; Prisma segue owner do schema | Conforme | `.github/workflows/ci.yml:39-55` (`pnpm supabase db push`); nenhuma referência a `migrate`/`migration` em `apps/api/src/**` (boot não aplica nada); `pnpm db:migrate:deploy` continua existindo em `package.json:12` como utilitário manual, não é chamado por CI nem por boot de serviço |
| R5 | `web`/`admin` não aplicam migrations; requests de negócio sob RLS | Conforme | Nenhum workspace `web`/`admin` referencia migration; `apps/api/src/server.ts:44` chama `assertRestrictedRuntime()` antes de aceitar tráfego, testado em `auth-rbac.test.ts:275-279` |
| R6 | Falhas visíveis em stdout/Sentry sem revelar credenciais | Conforme | Nenhum `console.log`/`echo` em scripts de migration imprime URL, senha ou token — apenas contagens (`verify-production-state.mjs:45`, `preflight-production-migrations.ts:216`, `validate-migrations.mjs:10`); `ci.yml` usa `test -n "$VAR"` para validar segredo presente sem ecoar valor |
| R7 | Exatamente três serviços sempre-on, sem staging/preview/`is_demo` | Conforme (não verificável 100% do repo) | Nenhum arquivo `railway.json`/`railway.toml`/`Procfile` no repo (config fica no dashboard Railway, fora do escopo de leitura); `docs/decisoes/44` mantém rejeição de `is_demo`; README documenta "Wait for CI" nos três serviços, mas isso é o próprio gate externo (a) que o ticket já declara aberto |

## Política de migration

**Fail-closed.** O núcleo de decisão não é a lista de padrões destrutivos
(`destructiveStatements`, `packages/db/scripts/migration-policy.mjs:1-22`,
que é só uma camada de mensagens amigáveis) — é o `allowedStatement`
(`migration-policy.mjs:26-27`), uma **allowlist de prefixo de comando**: só
`CREATE TYPE/TABLE/INDEX/POLICY`, `ALTER TABLE/ROLE`, `GRANT`, `DROP INDEX` e
`DO` passam; qualquer outro tipo de statement (UPDATE solto, INSERT, WITH/CTE,
CREATE FUNCTION/PROCEDURE/TRIGGER, COMMENT ON, SET, VACUUM, ALTER TYPE) cai no
`else` final e é rejeitado com "estrutura SQL não autorizada"
(`migration-policy.mjs:97-102`). Isso é o comportamente correto de uma
allowlist: nega por padrão o que não reconhece.

Vetores testados empiricamente (script `probe-policy.mjs`, execução real, sem
tocar banco):

| Vetor | Resultado | Avaliação |
| --- | --- | --- |
| `DO $$ ... $$` com `PERFORM`/`CALL`/`UPDATE`/literal | **REJEITADO** ("bloco DO não autorizado") | Escape relatado está de fato fechado — `allowedDoBody` (linha 31) exige o corpo canônico exato, ancorado `^...$`, sem folga para efeitos adicionais |
| `DO $tag$...$tag$` com tag customizada, corpo canônico | **ACEITO** (correto) | Delimitador customizado funciona para o caso legítimo |
| `DO $tag$...$tag$` com corpo canônico mas tag ficticia tentando "vazar" texto após o fechamento (`DO $a$ ... $a$ $b$ ... $b$; delete from stores;`) | **REJEITADO** ("controle transacional não autorizado" ou estrutura não autorizada, dependendo da forma) | Não há combinação de tags mal-formadas que produza SQL válido em Postgres *e* escape da allowlist ao mesmo tempo — tag incompatível gera erro de sintaxe real no Postgres antes mesmo de chegar a produção |
| `DO 'texto com PERFORM/CALL'` (aspas simples, sem `$$`) | **REJEITADO** ("bloco DO não autorizado") | Cai no `\bdo\b` de segurança em `validateDoBlocks` (linha 56) |
| `EXECUTE 'drop table stores'` dentro de `DO` | **REJEITADO** ("SQL dinâmico EXECUTE") | Qualquer `EXECUTE`, destrutivo ou não, é banido — inclusive fecha `format()`/concatenação, já que a palavra `EXECUTE` em si é o gatilho |
| `EXECUTE format('delete from %I', 'stores')` | **REJEITADO** ("SQL dinâmico EXECUTE") | Mesmo caso acima |
| `CREATE OR REPLACE FUNCTION ... $$ delete from stores $$` | **REJEITADO** (pega antes como "comando destrutivo DELETE", mas mesmo sem DELETE cairia em "estrutura não autorizada" pois `function` não está na allowlist de `CREATE`) | Bloqueado em duas camadas independentes |
| `CREATE TRIGGER ... EXECUTE FUNCTION f()` | **REJEITADO** ("SQL dinâmico EXECUTE") | Efeito colateral: toda sintaxe de trigger usa a palavra `EXECUTE`, então trigger é hoje estruturalmente impossível de passar — mais conservador que o necessário, não é brecha |
| `ALTER TABLE ... DROP CONSTRAINT` | **REJEITADO** ("comando destrutivo DROP não autorizado") | Confirmado também por teste do próprio agente (`migration-policy.test.mjs:34-37`) |
| `ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT` | **REJEITADO** (pega como "DROP COLUMN" pelo regex genérico de `alter table ... drop`) | Falso positivo favorável (mais restritivo que o necessário) |
| `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` / `NO FORCE ROW LEVEL SECURITY` / `BYPASSRLS` / `SUPERUSER` | **REJEITADO** | Confirmado, e já coberto por teste do agente |
| `DROP POLICY`, `DROP SCHEMA ... CASCADE`, `DROP TYPE`, `DROP OWNED` | **REJEITADO** ("DROP não autorizado") | O catch-all `\bdrop\s+(?!index\b)` bloqueia qualquer `DROP` que não seja `DROP INDEX` |
| `UPDATE stores SET ... ;` solto (sem `WHERE`) | **REJEITADO** ("estrutura SQL não autorizada") | `UPDATE` não está na allowlist de prefixos — bloqueado independente de ter `WHERE` ou não |
| `WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x;` (CTE) | **REJEITADO** ("comando destrutivo DELETE") | `destructiveStatements` roda sobre o texto inteiro do statement, não âncora ao início — captura DELETE embutido em CTE |
| `WITH x AS (UPDATE stores SET ...) SELECT 1;` (CTE) | **REJEITADO** ("estrutura SQL não autorizada") | Prefixo `with` não está na allowlist |
| `ALTER TABLE ... RENAME TO` / `RENAME COLUMN` | **ACEITO** | **Gap real — ver Divergências (MÉDIO)** |
| `ALTER TABLE ... ALTER COLUMN ... TYPE integer` (cast com perda) | **ACEITO** | **Gap real — ver Divergências (ALTO)** |
| `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` | **ACEITO** | Não é perda de dado (falha na aplicação se houver NULL existente, não apaga nada); aceitável |
| `CREATE/DROP INDEX CONCURRENTLY` | **ACEITO** pela política estática | Não roda no preflight transacional (Postgres proíbe `CONCURRENTLY` dentro de transação) — falha antes do `db push`, não é vetor de perda de dado, é limitação operacional. Ver Divergências (NOTA) |
| `ALTER TYPE ... ADD VALUE` | **REJEITADO** ("estrutura SQL não autorizada") | `ALTER` só permite `table`/`role`; estender um enum existente é hoje impossível via este pipeline — conservador demais, não é brecha de segurança |
| `GRANT foode_business TO postgres` | **ACEITO** (correto, por desenho) | Confirmado como padrão já usado em migration real (`packages/db/prisma/migrations/20260728132500_allow_admin_role_assumption/migration.sql:4`) — não é escalonamento, é o mecanismo que permite `SET LOCAL ROLE foode_business` a partir da conexão administrativa |
| `GRANT postgres TO foode_business` (inverso) | **REJEITADO** ("GRANT não autorizado") | Confirmado por teste do agente |
| Comentário partindo a palavra-chave (`DR/**/OP TABLE`) | **REJEITADO** ("estrutura SQL não autorizada: DR OP TABLE") | Não é um vetor real: Postgres também não trata `DR/**/OP` como `DROP` (comentário é separador de token no lexer), então mesmo se a política aceitasse não haveria exploração possível |

## Preflight transacional

- **Rollback garantido em qualquer caminho de erro.** O callback de
  `database.$transaction(async (transaction) => {...})`
  (`apps/api/scripts/preflight-production-migrations.ts:62-204`) sempre
  termina em `throw` — ou o `rollbackProof` deliberado após
  `proofCompleted = true` (linha 200-201), ou uma exceção real ocorrida antes
  disso (erro de SQL, isolamento, HTTP). Prisma só faz `COMMIT` se o callback
  resolver sem lançar; como não há nenhum caminho de retorno normal, o
  `ROLLBACK` é estrutural, não condicional. O `catch` externo
  (linha 205-207) só engole o `rollbackProof`; qualquer outro erro é
  relançado e falha o passo do CI antes de `sync-supabase`/`supabase db
  push`.
- **Comandos não-transacionáveis.** `CREATE/DROP INDEX CONCURRENTLY` passam
  na validação estática (ver tabela acima) mas falhariam ao rodar dentro do
  `$transaction` (erro nativo do Postgres: "cannot run inside a transaction
  block"). Isso interrompe o preflight com exceção — cai no mesmo caminho de
  rollback/erro acima e o job falha **antes** do `db push`. Não é um vetor de
  perda de dado; é uma migration que hoje nunca conseguiria ser aplicada por
  este pipeline (mesmo sendo estruturalmente inofensiva). Registrado como
  NOTA em Divergências.
- **Role da prova HTTP.** Confirmada como `foode_business` (não privilegiada):
  toda operação de negócio passa por `inStoreContext`
  (`packages/db/src/index.ts:66-77`), que executa
  `SET LOCAL ROLE foode_business` antes de qualquer query, dentro da MESMA
  transação injetada no Fastify via `createTransactionalBusinessDatabase`
  (linha 79-203). O catálogo (`assertIsolationCatalog`,
  `apps/api/scripts/migration-preflight-policy.mjs:13-33`) também confirma
  antes da prova que essa role não tem `bypassrls`, não é `superuser` e não
  herda role privilegiada.
- **"Zero resíduos" — o que é provado, exatamente.** Duas verificações
  independentes, em dois momentos:
  1. Dentro do próprio preflight, após o rollback, uma query administrativa
     conta `store.count({ where: { id: { in: fixtureStoreIds } } })` — confirma
     que as duas Lojas sintéticas criadas *dentro da transação* não existem
     mais depois do rollback (prova que o rollback realmente aconteceu no
     banco, não é só uma suposição do cliente).
  2. `packages/db/scripts/verify-production-state.mjs:23-37`, chamado no job
     `integration` **depois** de `pnpm test` (que roda contra produção via
     `BUSINESS_DATABASE_URL` e cria/streams fixtures reais, não em
     transação), consulta por padrão de `slug` (`fixture-rls-%`,
     `fixture-rbac-%`, `fixture-preflight-%`) — cobre fixtures de qualquer
     suíte que siga a convenção de nome, não só as do preflight. `store_members`
     tem `onDelete: Cascade` (`packages/db/prisma/schema.prisma:45`), então
     apagar a Loja já remove os vínculos; a query ainda soma
     `memberships` via join como checagem redundante caso o cascade
     regrida. As suítes (`auth-rbac.test.ts:201-211`,
     `store-routes.test.ts:119-129`) também fazem sua própria limpeza com
     `afterAll` + `expect(residueCount).toBe(0)`, então há checagem em três
     camadas (teste próprio, preflight, verificador independente).

## Risco real da exceção de branch protection

**Não.** Um push direto em `master` com `quality` vermelho não consegue
aplicar migration em produção — o próprio DAG do workflow impede isso, com ou
sem branch protection. `migrate` declara `needs: quality`
(`.github/workflows/ci.yml:28-29`); o comportamento padrão do GitHub Actions
para um job com `needs` é só rodar se a dependência terminou com sucesso
(equivalente a `if: success()`). O workflow dispara de forma idêntica em
`push: branches: [master]` e em `pull_request`
(`.github/workflows/ci.yml:3-6`) — não existe um caminho de push direto que
use um workflow diferente ou puleum o DAG. Confirmado ao vivo: o run do PR #6
(`30383519597`, checado via `gh pr view 6`) mostra os três jobs
`quality`/`migrate`/`integration` em sequência, todos `SUCCESS`, no HEAD
`f80718d`.

O risco residual da falta de branch protection não é essa corrida — é
**auto-modificação do próprio gate**: sem branch protection (confirmado
HTTP 403 ao vivo via `gh api repos/.../branches/master/protection` — mesmo
erro documentado no ticket), nada impede um push direto e não revisado que
altere `.github/workflows/ci.yml` (por exemplo removendo `needs: quality` de
`migrate`, ou os `test -n "$VAR"`) e uma migration destrutiva no mesmo commit
— o workflow que roda para aquele commit já nasce com a regra enfraquecida,
porque o CI é definido no próprio repositório e é lido do commit em
avaliação. Esse é o risco real da exceção: não é "vermelho migra", é
"ninguém revisa antes do gate mudar". Mitigação declarada (Railway "Wait for
CI") cobre o deploy de aplicação, não esse caminho específico de alteração do
workflow.

Adicionalmente: como o workflow dispara tanto em `pull_request` quanto em
`push: master`, o job `migrate` já roda — e já aplica migrations no único
Supabase de produção — a cada push numa branch de PR, antes mesmo do merge
(exatamente o que aconteceu no run `30383519597` do PR #6, que é um evento de
PR, não de push a `master`). Isso é consistente com a Decisão 55 (não há
"depois do merge" citado, só "depois de quality e preflight verdes"), mas
significa que o efetivo "ponto de aplicação" é o CI verde da branch, não o
merge — vale registrar para não confundir "aprovar o PR" com "é agora que a
migration entra em produção": ela pode já ter entrado antes.

## Divergências

- **ALTO** — `ALTER TABLE ... ALTER COLUMN ... TYPE <tipo>` com cast que perde
  dado (ex.: `numeric`→`integer`, truncamento de `varchar`) passa a política
  sem qualquer verificação (`packages/db/scripts/migration-policy.mjs:26-27`,
  confirmado por execução real: `validateMigrationSql` aceitou
  `alter table "orders" alter column "total" type integer;` sem lançar).
  Decisão 55 (`docs/decisoes/55-migrations-supabase-producao-ci.md:16`) declara
  "Migrations destrutivas: Proibidas... Mudança destrutiva exige nova decisão
  explícita". Um cast de tipo que trunca/perde precisão destrói dado por
  efeito, mesmo sem usar `DROP`/`DELETE`/`TRUNCATE` — e a política atual não
  distingue cast seguro (widening) de cast com perda. Correção sugerida:
  bloquear `ALTER COLUMN ... TYPE` por padrão (mesmo tratamento dado a
  `DROP`), exigindo decisão explícita nova como já ocorre para os demais
  casos destrutivos, ou permitir só uma allowlist fechada de casts
  comprovadamente seguros.
- **MÉDIO** — `ALTER TABLE ... RENAME TO` / `RENAME COLUMN` passa a política
  sem verificação (mesmo arquivo/linha; confirmado por execução real, ambos
  os casos `ACCEPTED`). Não apaga linhas, mas renomear tabela/coluna quebra
  silenciosamente o contrato de schema que o restante da política tenta
  proteger (o app aponta para o nome antigo e passa a falhar em runtime, não
  em CI). O prompt de verificação pediu explicitamente que este vetor fosse
  checado. Não é uma violação literal da Decisão 55 (que só cita
  `DROP TABLE`/`DROP COLUMN`/`DELETE`/`TRUNCATE`), mas é inconsistente com o
  desenho "allowlist estrutural fail-closed" já adotado para o resto de
  `ALTER TABLE`. Correção sugerida: bloquear `RENAME` (dentro de
  `ALTER TABLE`) na mesma política, ou registrar formalmente que renomear é
  aceito e por quê.
- **NOTA** — `CREATE/DROP INDEX CONCURRENTLY` passam a validação estática mas
  não podem rodar dentro da transação do preflight (restrição nativa do
  Postgres). O efeito prático é fail-closed (o job `migrate` falha antes do
  `db push`), mas a mensagem de erro que o founder veria seria um erro cru do
  Postgres, não uma mensagem de política. Não bloqueia o merge; vale um
  ajuste de DX futuro (detectar `CONCURRENTLY` e rejeitar cedo com mensagem
  clara, já que hoje esse tipo de migration nunca consegue ser aplicado por
  este pipeline de qualquer forma).
- **NOTA** — O workflow dispara em `pull_request` (qualquer branch-base, sem
  filtro) além de `push: master` (`.github/workflows/ci.yml:3-6`), então
  `migrate`/`integration` já tocam produção a cada push numa branch de PR,
  antes do merge. Não é uma falha de segurança (mesmo DAG fail-closed se
  aplica), mas é uma nuance operacional que vale documentar: "merge" não é
  o momento em que a migration entra em produção; o CI verde da branch é.

## Invariantes checadas

- **Decisão 55** — banco único (Supabase de produção), sem Docker/local/
  efêmero: confirmado, nenhum script do diff sobe ou referencia banco local
  (`packages/db/scripts/*`, `apps/api/scripts/*`). Migration nunca destrói
  dado: majoritariamente confirmado, com o gap ALTO de `ALTER COLUMN TYPE`
  acima. Nada aplicado sem gate verde: confirmado pelo DAG.
- **Segredos** — nenhuma credencial commitada; nenhum `echo`/`set -x`/log
  imprime connection string, senha ou token nos scripts revisados
  (`verify-production-state.mjs:45`, `preflight-production-migrations.ts:216`,
  `validate-migrations.mjs:10` só imprimem contagens). `ci.yml` usa
  `test -n "$VAR"` para validar presença sem ecoar valor.
- **Infra** — nenhuma referência a Vercel, staging, preview, Redis,
  WebSocket, SSE ou worker sempre-on no diff do ticket; nenhum arquivo de
  config Railway no repositório (fora do escopo de leitura, gate externo (a)
  do próprio ticket).
- **RLS** — `assertIsolationCatalog` e `assertRestrictedRuntime` continuam
  bloqueando role com bypass/superuser antes de aceitar tráfego ou concluir o
  preflight; prova HTTP roda sob `foode_business`.
- **Glossário** — nenhum termo do `CONTEXT.md` (`Avoid`) encontrado nos
  arquivos do footprint.

## Conforme

- R1, R3, R5, R6 plenamente conformes com evidência direta.
- R2 e R4 (corrigidos) conformes na arquitetura geral — banco único, role não
  privilegiada, cleanup em três camadas, aplicação só via GitHub
  Actions/Supabase CLI — com a ressalva ALTA sobre `ALTER COLUMN TYPE`
  registrada acima.
- O escape em blocos `DO` relatado pelo agente (`PERFORM`/`CALL`/`UPDATE`)
  está de fato fechado — reproduzi o caso e mais variações de tag customizada
  e todas foram rejeitadas.
- O rollback do preflight é estrutural (garantido por design do
  `$transaction`, não por um `if` que pode ser esquecido), e a prova HTTP
  roda comprovadamente sob a role não privilegiada.
- O DAG `quality → migrate → integration` protege contra push vermelho por
  si só; o gap real da falta de branch protection é auto-modificação do
  workflow por push direto não revisado, não a corrida quality/migrate.
- Nenhum segredo vaza em log/stdout nos scripts revisados.
