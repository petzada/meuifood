# 04 — Bloquear produção com CI e migrations validadas

**What to build:** Toda mudança passa por um gate GitHub Actions reproduzível, com qualidade, build, migrations e provas de RLS/RBAC antes dos três deploys Railway e da aplicação de migrations em produção.

**Blocked by:** 03 — Autenticar Dono e Operador e aplicar RBAC.

**Status:** done

- [x] O workflow instala pelo lockfile e executa lint, typecheck, testes e build dos workspaces relevantes.
- [x] O CI sobe Postgres descartável, aplica todas as migrations do zero e roda as provas RLS/RBAC com role não privilegiada.
- [x] Migration inválida, drift detectável ou quebra de isolamento falha antes de qualquer ação de produção.
- [x] Apenas a API executa migrations de produção com credencial dedicada antes de aceitar tráfego.
- [x] `web` e `admin` não aplicam migrations e requests de negócio continuam sujeitas a RLS.
- [x] Falhas ficam visíveis em stdout/Sentry sem revelar credenciais.
- [x] O fluxo mantém exatamente três serviços sempre-on na Railway, sem staging, preview ou Loja `is_demo`.

## Comments

- 2026-07-28 — Correção conforme `docs/decisoes/55-migrations-supabase-producao-ci.md`, que supersede a linha "Migrations Prisma" de `docs/decisoes/44-producao-only-sandbox-migrations-ci.md`. Dois requisitos acima estão superseded e valem como abaixo:
  - **Não vale** "O CI sobe Postgres descartável": não existe banco descartável, local, Docker, efêmero, simulador ou fallback. O banco é único — o **Supabase de produção**. O CI aplica as migrations e roda as provas RLS/RBAC contra ele, com role não privilegiada, usando fixtures de identificador sintético único e cleanup exato e verificado.
  - **Não vale** "Apenas a API executa migrations de produção": quem aplica é o **GitHub Actions via Supabase CLI**, automaticamente, depois do verde. `web`, `admin` e `api` não aplicam migrations — a API perde essa responsabilidade de boot. Prisma continua owner do schema e da autoria das migrations; a CLI é só o mecanismo de aplicação.
  - **Migration nunca destrói dado:** `DROP TABLE`/`DROP COLUMN` com dado, `DELETE` ou `TRUNCATE` de dado de negócio exigem decisão explícita nova. Apagar as próprias fixtures sintéticas de teste não é destruição de dado.
  - **CI vermelho relacionado ao banco bloqueia a aplicação:** nada é aplicado em produção sem o verde.

- 2026-07-28 — Implementação inicial e CI da PR #6 (`30380168302`) verdes no
  DAG `quality → migrate → integration`: histórico local/remoto 4/4, API 22/22
  e resíduos zero. As revisões internas independentes foram persistidas em
  `verification/reports/04-standards.md` e `04-spec.md`.
- 2026-07-28 — Achados internos procedentes corrigidos: política de migration
  fail-closed com allowlist estrutural, descoberta canônica única, Actions v6 e
  preflight no próprio Supabase. O preflight aplica apenas o SQL pendente em uma
  transação, injeta a mesma `Prisma.TransactionClient` no Fastify para provar
  HTTP/RLS/RBAC e força rollback antes de `db push`; consulta independente exige
  zero resíduos.
- 2026-07-28 — Dois gates externos continuam abertos e impedem
  `needs-review`/`done`: confirmar manualmente **Wait for CI** e ausência de
  pre-deploy migration nos três serviços Railway; e decidir como tornar
  obrigatório o gate de `master`, pois branch protection e rulesets retornam
  HTTP 403 no plano atual do repositório privado. Documentação não substitui
  essas confirmações.
- 2026-07-28 — O push corretivo `0182b05` passou no GitHub Actions
  (`30382305139`): jobs `quality`, `migrate` e `integration` verdes. A ordem do
  job de produção foi validação canônica → preflight transacional com rollback
  e resíduos zero → dry-run → push → histórico local/remoto exato 4/4. Depois,
  banco 30/30 e API 25/25 passaram, e o verificador independente novamente
  encontrou zero fixtures sintéticas residuais. Os dois gates externos acima
  permanecem abertos; por isso o status continua `ready-for-agent`.
- 2026-07-28 — **Gate externo 1 resolvido, com correção.** Consulta à API da
  Railway (projeto `sparkling-embrace`) confirmou os três serviços `@foode/web`,
  `@foode/api` e `@foode/admin` com trigger `github petzada/meuifood`,
  `branch=master`, `env=production` e **pre-deploy `null`** — nenhum app aplica
  migration, como a `55` e a `25` exigem. Porém **"Wait for CI" (`checkSuites`)
  estava `false` nos três**: o deploy não esperava o CI, o que contraria a
  premissa do ticket ("gate GitHub Actions antes dos três deploys Railway").
  Corrigido via `deploymentTriggerUpdate` e reconferido: `checkSuites=true` nos
  três. O banco nunca esteve exposto por isso (o job `migrate` depende de
  `quality`), mas código reprovado podia chegar a produção.
- 2026-07-28 — **Gate externo 2 resolvido pelo founder:** sem upgrade para GitHub
  Pro/Team. A exceção foi formalizada em
  `docs/decisoes/56-excecao-master-sem-branch-protection.md`, com o risco real
  delimitado (o DAG já impede migration com `quality` vermelho; o que a exceção
  expõe é push direto alterando o próprio `ci.yml`) e gatilhos de reabertura.
  A `25` foi anotada reciprocamente.
- 2026-07-28 — **Verificação externa Claude/Sonnet** (HEAD `f80718d`): política
  confirmada **fail-closed**. Escapes testados e rejeitados: `DO` com
  `PERFORM`/`CALL`/`UPDATE`/tag customizada, `EXECUTE`/`format()`, `CREATE
  FUNCTION`/`PROCEDURE`/`TRIGGER` destrutivo, `DROP CONSTRAINT`/`POLICY`/
  `SCHEMA`/`TYPE`/`OWNED`, `DISABLE RLS`/`BYPASSRLS`/`SUPERUSER`, `UPDATE` sem
  `WHERE` e `DELETE` em CTE. Três lacunas encontradas e **corrigidas neste
  commit**:
  - `ALTER COLUMN ... TYPE` com cast passava sem checagem (perda silenciosa de
    dado, sem apagar linha) — agora exige decisão explícita.
  - `ALTER TABLE ... RENAME` passava sem checagem — agora exige decisão
    explícita, porque a versão anterior da aplicação segue no ar durante o
    deploy.
  - `CONCURRENTLY` passava a validação estática e só falhava com erro cru do
    Postgres dentro do preflight — agora é rejeitado cedo, com mensagem própria.
  Seis casos de teste novos em `packages/db/scripts/migration-policy.test.mjs`
  (36/36 verdes). Nenhuma migration do histórico é afetada pelas regras novas.
- 2026-07-28 — A releitura corretiva encontrou um escape adicional em blocos
  `DO`. TDD reproduziu o caso com `PERFORM`/`CALL`/`UPDATE`; a política agora só
  aceita o bloco canônico de criação da role `foode_business` sem privilégios.
  O helper de credenciais/URL de produção também foi centralizado. Lint,
  typecheck, `test:quality` (banco 35/35), build, preflight real com rollback e
  verificação independente 4/4 passaram, ambos com resíduos zero. Nenhum achado
  interno permanece aberto; os dois gates externos continuam bloqueando a
  mudança de status.
- 2026-07-28 — Critérios de aceite marcados `[x]` sob `Status: done`. Os dois
  requisitos superseded pela Decisão 55 (Postgres descartável; API aplicando
  migration) permanecem com o texto histórico acima e valem na forma corrigida
  já registrada no primeiro Comment deste ticket — sem reescrever a decisão.
- 2026-07-28 — Depois do ledger pass em `bca86fb459ca4e2a354831c1f11c424349e954d8`
  (PR #9 / `3d3a71a`, resíduos amplos + `queue: max`), entrou
  [PR #11](https://github.com/petzada/meuifood/pull/11) /
  `ae13bf1e5c231d194b0491da8ac8bfd4af6a24c9` (`8165036`: Node 24 em
  `package.json` `engines` e `.nvmrc`, alinhado ao `node-version: 24` do CI).
  Isso amplia o footprint de verificação deste ticket para `package.json` e
  `.nvmrc`; o trecho `importFileExtension = "js"` em
  `packages/db/prisma/schema.prisma` (PR #8 / `798e0c8`) já estava no footprint
  da rodada 2 e permanece relevante como a mesma classe de mismatch
  CI-vs-produção no boot. **Confirmação do usuário** (não é evidência
  automatizada): no projeto Railway `sparkling-embrace`, os serviços
  `@foode/web`, `@foode/api` e `@foode/admin` subiram `ae13bf1` sem crash de
  WebSocket/boot.
- 2026-07-29 — Ticket 09 / PR #18 alterou novamente o footprint deste ticket:
  `packages/db/scripts/migration-policy.mjs` passou a aceitar `ALTER TYPE`
  aditivo para enums PostgreSQL. O Composer 2.5 considerou a mudança
  fail-closed e não bloqueadora, com padrões destrutivos ainda rejeitados, mas
  recomendou reverificação leve e um caso positivo específico para
  `ALTER TYPE ... ADD VALUE`. Estado registrado como `✅ conforme 🔄` no
  STATUS; não reabre `Status: done`.
