# Verificação — Ticket 04 Bloquear produção com CI e migrations validadas

- Veredito: **divergências**
- Rodada: 2 (verificação final em `master`, pós-correções) · Verificado em: 2026-07-28 · HEAD `7555533` (merge de PR #8, que segue PR #7/f80718d)
- Rodada anterior: `f80718d`, PR #6 — apontou 1 ALTO (`ALTER COLUMN TYPE`) e 1 MÉDIO (`RENAME`) na política, mais 2 NOTAs.
- Footprint desta rodada: `packages/db/scripts/migration-policy.mjs`, `packages/db/scripts/migration-policy.test.mjs`, `.github/workflows/ci.yml`, `packages/db/scripts/verify-production-state.mjs`, `apps/api/scripts/preflight-production-migrations.ts`, `apps/api/src/store-routes.test.ts`, `apps/api/src/auth-rbac.test.ts`, `packages/db/prisma/schema.prisma`, `docs/decisoes/56-excecao-master-sem-branch-protection.md`, `docs/decisoes/25-hospedagem-ci-ops.md`
- Bloqueadores: 0 · Altos: 1 · Médios: 1 · Notas: 1

## Método

Leitura estática de todo o diff `f80718d..7555533` (`git diff --stat`, e diff completo arquivo a arquivo). Execução real de `validateMigrationSql` (import ESM puro, sem tocar banco/repo) contra 15 vetores de ataque novos, focados especificamente nas três regras adicionadas nesta rodada (`ALTER COLUMN TYPE`, `RENAME`, `CONCURRENTLY`), incluindo tentativas de disfarce por espaçamento, identificador entre aspas, homóglifo Unicode, múltiplos statements na mesma linha e quebra de linha no meio do comando. Script em
`C:\Users\MARCIO~1.PET\...\scratchpad\probe-policy-2.mjs` (fora do produto, não commitado). Conferi as três migrations existentes em `packages/db/prisma/migrations/*/migration.sql` contra as regras novas (nenhuma contém `rename`, `concurrently` ou `alter...type`). Consultei `gh pr view 7` e `gh pr view 8` (checks reais, não simulados) para confirmar que os workflows das duas correções rodaram verdes em produção, e usei uma busca externa para confirmar a semântica exata de `concurrency` de job do GitHub Actions (fila de 1 pendente, com descarte do job enfileirado anterior quando chega um novo pedido do mesmo grupo — comportamento documentado, não dedução minha).

## Requisitos do ticket

| # | Requisito (resumo; R2/R4 já superseded pelos Comments) | Veredito | Evidência |
| --- | --- | --- | --- |
| R1 | Lockfile + lint/typecheck/testes/build dos workspaces relevantes | Conforme | `.github/workflows/ci.yml:21-26`; PR #8 (mudança em `schema.prisma`) rodou `quality`/`migrate`/`integration` verdes (`gh pr view 8`, run `30389442556`), provando que `importFileExtension = "js"` não quebra typecheck/test/build |
| R2 (corrigido) | Sem banco descartável; provas contra Supabase de produção, role não privilegiada, cleanup exato e verificado | Conforme com ressalva ALTA | Preflight roda contra produção (`apps/api/scripts/preflight-production-migrations.ts:41-45`); role `foode_business` (`packages/db/src/index.ts`, inalterado); cleanup agora tem uma lacuna de cobertura — ver Auditoria, item 3 |
| R3 | Falha antes de qualquer ação de produção | Conforme | Inalterado desde a rodada 1 (`migration-preflight-policy.mjs`, `ci.yml` job `migrate needs: quality`) |
| R4 (corrigido) | GitHub Actions via Supabase CLI aplica; nenhum app aplica | Conforme | Inalterado; `ci.yml:59-70` |
| R5 | `web`/`admin` não aplicam migration; RLS vale | Conforme | Sem mudança no footprint desta rodada |
| R6 | Falhas visíveis sem revelar credencial | Conforme | `ci.yml` segue usando `test -n "$VAR"`; nenhum script novo ecoa segredo (`verify-production-state.mjs:44-51` só imprime contagem e, agora, o `CI_RUN_ID`, que não é segredo) |
| R7 | Três serviços sempre-on, sem staging/preview/`is_demo` | Conforme (externo, não re-verificado nesta rodada) | Nenhum arquivo Railway no diff desta rodada |

## Auditoria das correções do orquestrador

### 1. `migration-policy.mjs` — três regras novas (`ALTER COLUMN TYPE`, `RENAME`, `CONCURRENTLY`)

**Resolve.** Rodei 15 vetores de ataque reais contra `validateMigrationSql` (script de prova citado no Método), incluindo os pedidos explicitamente no prompt de verificação:

| Vetor | Resultado |
| --- | --- |
| `alter table orders alter column total type numeric(10,2);` | REJEITADO |
| Quebra de linha entre `ALTER TABLE`, `ALTER COLUMN` e `TYPE` | REJEITADO |
| Identificador entre aspas (`"total"` → vira `""` no pré-processamento) | REJEITADO |
| Identificador com homóglifo Unicode (`"tοtal"`, omicron grego) | REJEITADO (o regex de identificador aceita qualquer coisa entre aspas, então o disfarce nem era necessário) |
| Dois statements na mesma linha, um legítimo + um `ALTER COLUMN TYPE` | REJEITADO |
| `alter table orders rename to pedidos;` / `rename column ... to ...;` / `rename constraint ...;` | REJEITADO em todos os casos |
| `alter index orders_pkey rename to orders_pk;` (objeto diferente) | REJEITADO (cai duplamente: pela regra `RENAME` e por `allowedStatement` não aceitar `alter index`) |
| `create index concurrently ...` / `drop index concurrently ...`, inclusive com quebra de linha | REJEITADO |
| Cast "legítimo" de alargamento (`varchar(50)` → `varchar(255)`) | REJEITADO — a política não distingue widening de narrowing, trata todo `ALTER COLUMN TYPE` como destrutivo por padrão, exigindo decisão explícita nova. É mais restritivo que o estritamente necessário, mas é o mesmo padrão fail-closed já usado para `DROP`; não é uma falha, é a postura correta dado o objetivo do ticket. |

Não encontrei nenhuma combinação que destrua/renomeie dado e passe. O único `ACCEPTED` fora da tabela acima foi `create index conc/**/urrently orders_idx on orders (store_id);` (comentário partindo a palavra `CONCURRENTLY` ao meio) — mas isso não é SQL válido: um comentário de bloco separa tokens no lexer do Postgres, então `conc` e `urrently` seriam dois identificadores distintos e a migration falharia por erro de sintaxe real no banco antes de qualquer efeito. É a mesma classe de não-vetor já documentada na rodada 1 para `DR/**/OP TABLE`. Não é finding.

Também confirmei que nenhuma das 4 migrations existentes em `packages/db/prisma/migrations/` contém `rename`, `concurrently` ou `alter...type` (`grep -inE` vazio) — as regras novas não quebram histórico real, batendo com a alegação do Comment do ticket ("Nenhuma migration do histórico é afetada").

Os 6 casos novos em `migration-policy.test.mjs:146-171` cobrem exatamente as duas formas de cada regra (`type` direto e `set data type`; `rename to` e `rename column`; `create`/`drop index concurrently`) — consistente com o que testei manualmente.

### 2. `.github/workflows/ci.yml` — grupo de concorrência `supabase-producao-migrations`

**Resolve o problema que motivou a correção, com ressalva MÉDIA.** A evidência de que o bug motivador era real está no próprio histórico: o commit `ebc4ac1` (PR #7) documenta que a run de `master` (`d4c359b`) e a da PR (`aa1a5c2`) rodaram ao mesmo tempo e a checagem de resíduo da PR falhou com "Lojas=2" por enxergar fixtures em voo da outra run — falso positivo confirmado, não uma hipótese.

O grupo fixo (`supabase-producao-migrations`, sem `github.ref`) aplicado em `migrate` (`.github/workflows/ci.yml:39-41`) e `integration` (`ci.yml:77-79`) garante que **nenhum job que toque o banco roda em paralelo com outro**, de qualquer run — resolve a intercalação `migrate`-de-uma-run com `integration`-de-outra que o prompt pediu para investigar, porque o grupo é o mesmo nos dois jobs e o GitHub Actions serializa por grupo independentemente do nome do job.

**Ressalva:** nem `migrate` nem `integration` declaram `queue: max` no bloco `concurrency` (`ci.yml:39-41`, `77-79`). O comportamento documentado do GitHub Actions para um grupo de concorrência sem `queue: max` é: **no máximo um job pendente por grupo**; se um terceiro pedido do mesmo grupo chega enquanto já existe um pendente, o pendente anterior é **cancelado** (não executa), mesmo com `cancel-in-progress: false` — esse parâmetro só protege o job que já está *rodando*, não o que está na fila. Com o workflow disparando em `pull_request` (qualquer branch, sem filtro) e em `push: master` (`ci.yml:3-6`), três ou mais runs simultâneas tocando o banco (ex.: push em `master` + duas PRs atualizadas quase ao mesmo tempo) são plausíveis para um founder solo iterando. Nesse cenário, um job `integration` que já estava na fila — cuja run correspondente já teve `migrate` aplicado com sucesso em produção — pode ser cancelado antes de rodar, e a prova RLS/RBAC e a verificação de resíduo que R2 exige para aquela migration específica simplesmente não executam. Isso não resulta em deploy inseguro (o check não fecha como sucesso, então "Wait for CI" da Railway não libera), mas deixa a prova daquela execução permanentemente pendente até alguém notar o `cancelled` e re-disparar manualmente. Registrado como MÉDIO abaixo.

### 3. `verify-production-state.mjs` — resíduo escopado por `CI_RUN_ID`

**Não resolve sem abrir buraco — e o buraco é o motivo de esta ser a ressalva ALTA da rodada.**

Primeiro, o sufixo: os três geradores realmente terminam o slug com `${runId}`, sem sufixo extra depois:
- `apps/api/scripts/preflight-production-migrations.ts:120,128` → `fixture-preflight-a-${runId}`, `fixture-preflight-b-${runId}`
- `apps/api/src/store-routes.test.ts:98,107` → `fixture-rls-a-${runId}`, `fixture-rls-b-${runId}`
- `apps/api/src/auth-rbac.test.ts:155,181` → `fixture-rbac-${runId}`, `fixture-rbac-b-${runId}`

E os três leem `process.env.CI_RUN_ID` (`preflight-production-migrations.ts:47`, `store-routes.test.ts:80`, `auth-rbac.test.ts:98`), que recebe exatamente `${{ github.run_id }}-${{ github.run_attempt }}` tanto no job `migrate` (`ci.yml:58`) quanto no `integration` (`ci.yml:95`) — os dois jobs usam o mesmo valor. A query em `verify-production-state.mjs` usa `slug like '%' || $1` (sufixo, não prefixo/conteúdo), que casa corretamente com esse formato. Então, tecnicamente, a query **acha** o que é desta run. Isso responde "sim" à pergunta literal do prompt sobre terminação de sufixo.

O problema real é outro, mais sério: **a prova deixou de proteger contra exatamente o cenário para o qual ela existe.** Antes desta mudança, `verify-production-state.mjs` era uma checagem independente e *não escopada* — pegava qualquer fixture `fixture-rls-%`/`fixture-rbac-%`/`fixture-preflight-%` no banco, não importa de qual run. Essa é a razão de ela existir como camada separada do `afterAll` de cada teste: o `afterAll` só limpa se o processo terminar normalmente; se uma run trava, é cancelada manualmente, ou o runner cai no meio do `pnpm test`, o `afterAll` pode não rodar, e a checagem independente era o que pegava esse resíduo *na próxima run*, falhando alto e forçando alguém a olhar. Agora, com o escopo por `CI_RUN_ID`, a query da próxima run só enxerga fixtures cujo slug termina no **seu próprio** `CI_RUN_ID` — resíduo deixado por uma run anterior que crashou nunca mais aparece para nenhuma run futura, porque nenhuma run futura tem aquele `CI_RUN_ID`. Responde a pergunta do prompt "se uma run anterior crashou e deixou fixture, quem pega agora?": **ninguém.** A prova de "zero resíduos" que a Decisão 55 exige ("cleanup exato e **verificado**") continua batendo para a run atual, mas silenciosamente parou de significar "banco sem lixo sintético" — passou a significar só "esta run não deixou lixo", o que é uma garantia estritamente mais fraca, e o comentário adicionado ao próprio arquivo (`verify-production-state.mjs`, bloco antes da query) confirma que essa foi uma escolha deliberada ("deixa de contar fixture de outra run"), não um efeito colateral não percebido.

Agrava o ponto: essa perda de cobertura parece **desnecessária**, porque o problema que motivou a mudança (fixtures de duas runs em voo ao mesmo tempo colidindo na mesma checagem) já é resolvido pela correção do item 2 (grupo de concorrência) sozinha — com `migrate`/`integration` serializados, no momento em que `integration` roda, qualquer fixture residual encontrada pela query antiga (sem escopo) só pode pertencer a uma run *anterior já terminada* — exatamente o caso de crash que a checagem independente deveria continuar pegando. Ou seja: a correção do item 2 já eliminava o falso positivo relatado no commit `ebc4ac1`; a correção do item 3, feita em cima, não era necessária para resolver aquele bug específico e retirou da checagem justamente a capacidade de detectar o cenário mais perigoso (resíduo real de uma run que não terminou limpo). Classificado como **ALTO** — não é perda de dado de negócio (só fixtures sintéticas), mas é uma regressão real e silenciosa na garantia de R2 que a rodada 1 havia validado como "conforme".

### 4. Geradores de fixture (`preflight-production-migrations.ts`, `store-routes.test.ts`, `auth-rbac.test.ts`) usando `CI_RUN_ID`

**Resolve o que prometia** (alinhar o `runId` de cada gerador ao identificador da run de CI), mas é a mesma mudança que alimenta o buraco do item 3 — os dois foram avaliados juntos acima. Fora de CI (`process.env.CI_RUN_ID` indefinido), cada gerador cai de volta em um valor aleatório (`randomBytes`/`randomUUID`) e `verify-production-state.mjs` trata `$1::text is null` como "sem escopo", preservando o comportamento antigo para execução local — isso está correto e não é o problema.

### 5. `packages/db/prisma/schema.prisma` — `importFileExtension = "js"`

**Resolve, sem efeito colateral no que audita este ticket.** É uma opção do generator do Prisma Client (`packages/db/prisma/schema.prisma:9`, adicionada em `798e0c8`) que só afeta a extensão dos imports relativos emitidos no client TypeScript gerado (`packages/db/src/generated/prisma/`, `.gitignore:7`, não versionado) — não toca schema, migrations ou SQL. Confirmado via `gh pr view 8`: os três jobs (`quality`, `migrate`, `integration`) rodaram verdes no run `30389442556` com essa mudança, ou seja, `lint`/`typecheck`/`test:quality`/`build` e o preflight real contra produção não quebraram. O motivo documentado no commit (`ERR_MODULE_NOT_FOUND` em produção porque `moduleResolution: "Bundler"` gera import sem extensão e `tsc` não reescreve) é coerente com o sintoma descrito e não tem relação com a política de migration, RLS ou o gate de CI — está fora do escopo de risco deste ticket, só corrige um bug de build que teria quebrado o boot do serviço `api` em produção (o que teria sido pior: teria passado no CI mas falhado no deploy real, já que o CI não roda `node dist/server.js`).

## Divergências

- **ALTO** — `verify-production-state.mjs` (query construída a partir de
  `packages/db/scripts/verify-production-state.mjs`, bloco `with fixture_stores as (...)`,
  cláusula `and ($1::text is null or slug like '%' || $1)`) escopa a checagem de resíduo
  por `CI_RUN_ID`, e com isso **para de detectar** fixtures sintéticas deixadas por uma run
  anterior que não terminou seu `afterAll` (crash, cancelamento manual, queda de runner) —
  nenhuma run futura tem o `CI_RUN_ID` daquela run para encontrá-las. Antes desta mudança
  (rodada 1, validada como conforme), a checagem era ampla e pegaria esse resíduo na
  próxima execução. Decisão 55 exige cleanup "exato e verificado"
  (`docs/decisoes/55-migrations-supabase-producao-ci.md:18`); a verificação agora é exata
  só para a própria run, não mais um gate independente contra resíduo histórico. Além disso,
  a correção parece desnecessária: o grupo de concorrência (`ci.yml:39-41`, `77-79`) já
  serializa os jobs que tocam o banco e sozinho resolve o falso positivo documentado em
  `ebc4ac1` (duas runs em voo ao mesmo tempo), tornando o escopo por `CI_RUN_ID` uma troca
  de cobertura por nada. Correção sugerida: reverter o escopo em
  `verify-production-state.mjs` (manter a query ampla) agora que o grupo de concorrência
  evita a colisão em voo; se o escopo for mantido por outro motivo, adicionar uma segunda
  checagem, não escopada, que rode periodicamente ou no início de cada `integration` e falhe
  alto se houver qualquer fixture com mais de N minutos, independentemente do `CI_RUN_ID`.
- **MÉDIO** — `.github/workflows/ci.yml:39-41` e `77-79` declaram
  `concurrency: { group: supabase-producao-migrations, cancel-in-progress: false }` sem
  `queue: max`. O comportamento documentado do GitHub Actions para essa configuração é fila
  de no máximo um job pendente por grupo; um terceiro pedido do mesmo grupo cancela o job
  que já estava na fila, mesmo com `cancel-in-progress: false` (esse parâmetro só protege o
  job em execução). Com o workflow disparando em `pull_request` sem filtro de branch e em
  `push: master` (`ci.yml:3-6`), três ou mais runs simultâneas tocando o banco são plausíveis
  para o operador único iterando em paralelo (branch + push direto, ou duas PRs). Um job
  `integration` enfileirado pode ser cancelado antes de rodar mesmo depois de o `migrate`
  correspondente já ter aplicado a migration em produção com sucesso — a prova RLS/RBAC e a
  verificação de resíduo daquela execução específica (exigidas por R2) não chegam a rodar.
  Não é inseguro para o deploy (o check não fecha verde, "Wait for CI" não libera), mas é uma
  lacuna de verificação que passa despercebida até alguém checar manualmente o `cancelled`.
  Correção sugerida: adicionar `queue: max` aos dois blocos de `concurrency`, ou aceitar
  formalmente o risco documentando-o (hoje não está documentado em lugar nenhum, nem no
  comentário do `ci.yml` nem em `docs/decisoes/`).
- **NOTA** — `CREATE/DROP INDEX CONCURRENTLY` agora falha cedo com mensagem própria
  (`migration-policy.mjs:38-44`, confirmado por execução real), fechando a NOTA de DX da
  rodada 1. Sem novo achado aqui.

## Invariantes checadas

- **Decisão 55** — banco único, sem Docker/local/efêmero: nenhuma mudança nesta rodada
  introduz um segundo banco. Migration nunca destrói dado: as duas lacunas da rodada 1
  (`ALTER COLUMN TYPE`, `RENAME`) estão fechadas e verificadas empiricamente; nenhum novo
  vetor destrutivo encontrado nas regras novas. Nada aplicado sem gate verde: DAG
  `quality → migrate → integration` inalterado.
- **Segredos** — `verify-production-state.mjs` agora imprime `CI_RUN_ID` na mensagem de log
  (`resíduos sintéticos: 0 (escopo: run ...)`), que é um identificador de execução do GitHub
  Actions (`run_id-run_attempt`), não uma credencial; não há vazamento.
- **RLS** — sem mudança no footprint desta rodada (`inStoreContext`, `assertIsolationCatalog`
  inalterados).
- **Histórico de migrations** — as 4 migrations reais em
  `packages/db/prisma/migrations/` não contêm `rename`, `concurrently` nem `alter ... type`
  (confirmado por grep); as regras novas não afetam o passado, consistente com o Comment do
  ticket.

## Conforme

- R1, R3, R4, R5, R6 seguem conformes, sem regressão introduzida por esta rodada.
- As duas lacunas ALTA/MÉDIA da rodada 1 na política de migration (`ALTER COLUMN TYPE`,
  `RENAME`) estão fechadas — testei 15 vetores de disfarce (espaçamento, aspas, Unicode,
  múltiplos statements, quebra de linha, objeto diferente) e nenhum destrói/renomeia dado
  passando pela política. `CONCURRENTLY` também fechado com mensagem própria.
- `importFileExtension = "js"` corrige um bug real de boot em produção sem efeito colateral
  no CI (`quality`/`migrate`/`integration` verdes no run que a introduziu) e está fora do
  raio de risco deste ticket.
- O grupo de concorrência resolve o falso positivo real documentado no histórico
  (`ebc4ac1`/PR #7) e impede intercalação de `migrate`/`integration` entre runs — mas sem
  `queue: max` (ressalva MÉDIA).

## Novos achados desta rodada não presentes na rodada 1

- ALTO — escopo por `CI_RUN_ID` em `verify-production-state.mjs` remove a capacidade de
  detectar resíduo de runs anteriores que não terminaram limpo.
- MÉDIO — ausência de `queue: max` no grupo de concorrência permite cancelamento silencioso
  de um job `integration` já enfileirado quando 3+ runs concorrentes tocam o banco.

## Addendum — resolução pós-rodada 2

- 2026-07-28 — As divergências **ALTO** (resíduo escopado por `CI_RUN_ID`) e **MÉDIO**
  (ausência de `queue: max`) documentadas acima foram **resolvidas** em
  `3d3a71a40a68de50c6b4b596361f9f5e8477c85a` / [PR #9](https://github.com/petzada/meuifood/pull/9)
  (merge `bca86fb459ca4e2a354831c1f11c424349e954d8`). Evidência local no `master` atual:
  `packages/db/scripts/verify-production-state.mjs` voltou à busca ampla de fixtures
  `fixture-rls-%` / `fixture-rbac-%` / `fixture-preflight-%` (sem filtro por `CI_RUN_ID`);
  `.github/workflows/ci.yml` declara `queue: max` nos jobs `migrate` e `integration`.
  O ledger em `bca86fb` registra veredito `pass` com `openFindings: 0`. O corpo da
  rodada 2 acima permanece como histórico do estado verificado em `7555533`.
