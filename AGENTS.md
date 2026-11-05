# AGENTS.md

## Agent skills

### Issue tracker

Specs e tickets são rastreados como markdown local em `.scratch/mvp-foode-delivery/`. Veja `docs/agents/issue-tracker.md`.

### Domain docs

Este é um repositório single-context; use o glossário raiz e as decisões e ADRs canônicos. Veja `docs/agents/domain.md`.

## Stack (decisão 59, ADR 0006)

Tudo na Cloudflare, monorepo pnpm, Node 24:

| Pacote | O que é | Worker |
| --- | --- | --- |
| `apps/api` | Hono. Fetch público só `/health`, `/storefront/*` e `/webhooks/*`; o Painel usa o entrypoint RPC `PainelApi`, só por service binding | `foode-api` |
| `apps/web` | Storefront, Next via OpenNext; binding `API` (fetch) | `foode-web` |
| `apps/admin` | Painel, Next via OpenNext; binding `API` (entrypoint `PainelApi`) | `foode-admin` |
| `packages/db` | D1 + Drizzle; migrations SQL em `packages/db/migrations` | — |

Regras do OpenNext: middleware do Next em `middleware.ts` (edge), **nunca** `proxy.ts` (no Next 16 roda em Node e o OpenNext não suporta Node Middleware); nada de `runtime = "edge"` em rotas; bindings por `getCloudflareContext()` dentro do request (nunca cliente criado no escopo do módulo). Cada Worker cabe em **10 MiB gzip** (Workers Paid): o CI e o deploy conferem com `scripts/worker-size.mjs`. O build OpenNext não roda no Windows (symlinks do pnpm): prove-o no CI.

`apps/api/legacy-fastify/` e `packages/db/legacy-prisma/` são a stack antiga (Fastify, Prisma, Supabase): **referência de comportamento** para os Tickets 22–24, fora de lint, typecheck e testes. Saem no Ticket 25.

## Comandos

Os mesmos nomes de script de todos os repositórios (rode na raiz):

| Script | O que faz |
| --- | --- |
| `pnpm lint` | ESLint do repositório + lint das migrations |
| `pnpm typecheck` | build de `shared`/`ui` e `tsc --noEmit` em todos os pacotes |
| `pnpm test` | testes sem banco (vitest, todos os projetos) |
| `pnpm test:related` | só os testes ligados ao diff contra `origin/master`, **sem testes com D1** |
| `pnpm test:workers` | testes com D1 no workerd (`*.d1.test.ts`, `@cloudflare/vitest-plugin`) — **só no CI** |
| `pnpm test:ci` | `test` + `test:workers` (o que o CI roda) |
| `pnpm build` | bundle da api (`wrangler --dry-run`) e `next build` de web/admin |
| `pnpm build:cf` | build OpenNext de web/admin (o que o deploy publica) |
| `pnpm e2e` | smoke HTTP contra os Workers publicados (`scripts/smoke.mjs`) |
| `pnpm db:generate -- --name <nome>` | gera a migration SQL a partir de `packages/db/src/schema.ts` |

Gates locais (`lefthook.yml`): pre-commit formata (prettier, `stage_fixed`) e roda ESLint com cache nos arquivos em stage e o lint das migrations; pre-push roda `1_typecheck` e `2_related`. Nunca `--no-verify`.

**Sem banco local nem Docker.** Testes com D1 e a prova das migrations rodam só no CI. Não rode `wrangler deploy`, `wrangler d1 migrations apply --remote`, `wrangler d1 execute --remote` nem nada que altere produção do notebook.

## Fluxo de git (resumo de `~/.claude/CLAUDE.md`, vale acima de skills e fluxos)

O Dono é dev solo: o trabalho fica sempre salvo; publicar e ir para produção são decisões dele (ou do orquestrador com a autorização abaixo).

1. **Salvar sempre.** Terminou uma implementação (ou um subagente terminou a parte dele): commit na branch da feature (Conventional Commits, PT-BR) e `git push -u origin <branch>`. Nunca na `master`. Push sem PR não roda CI. Subagente em worktree commita e pusha a própria branch; a sessão principal integra com `git merge --no-ff` e pusha.
2. **Ao terminar, reportar**: o que mudou, o que foi validado, branch e commit salvos, se há migration ou flag, o próximo passo.
3. **"Abre o PR" / "finaliza"**: PR pronto (não draft, salvo pedido explícito), acompanha o CI (`gh run watch`); falhou, corrige tudo num push só e acompanha de novo; no fim: "tudo verde; se quiser subir para produção, peça o merge".
4. **"Suba pra produção" / "faça o merge"**: squash merge → `db-migrate` se houver migration (contract só com confirmação explícita) → deploy pelo CI → smoke → reporta.

Falha de CI se investiga com `gh run view <id> --log-failed`. Deploy só pelo CI.

### Autorização de merge por ticket (execução do pivô)

O Dono autorizou em 2026-11-04 ([decisão 59](docs/decisoes/59-pivo-cloudflare-d1-workers.md), "CI/CD e integração") que, **durante a execução dos Tickets 21–30 do pivô**, o orquestrador feche cada ticket sem pedir de novo: PR → CI verde → **squash merge na `master`** → `db-migrate` (se houver migration) → deploy pelo CI → smoke. Exceções que continuam exigindo confirmação explícita do Dono: migration **contract**, qualquer ação fora do ticket e ações irreversíveis em contas/dados. Fora dessa execução, vale o fluxo acima.

## Banco (D1)

- **Um D1 de produção** (`foode-prod`, binding `DB` só no Worker `foode-api`). Sem RLS: o isolamento entre Lojas é invariante do código de `packages/db`.
- **`packages/db` é a única porta**: exporta `createFoodeDb(env.DB)` e operações que exigem `StoreContext` (emitido por `access.storeContext` depois de conferir a membership no banco) ou `OpsContext` (papel global `foode_ops`). O `store_id` nunca vem de header/query/body sem passar por aí. Contexto falsificado é recusado em runtime.
- O ESLint proíbe nos apps: importar `drizzle-orm`, chamar `prepare`/`batch` e usar `env.DB` fora de `createFoodeDb(...)` (fixture: `seedTwoStores(env.DB)` só em testes).
- Convenções: datas em `TEXT` ISO-8601 UTC com milissegundos (`2026-11-04T12:00:00.000Z`, `utcNow()`), conferidas por `CHECK`; enums em `TEXT` + `CHECK`; dinheiro em centavos `INTEGER` (sufixo `_cents`, `CHECK (… >= 0)`, helper `cents()`); ids UUID gerados no Worker.
- Sem transação interativa: escrita que depende de leitura usa `batch` atômico com `INSERT … SELECT` condicional e constraints `UNIQUE`.
- Todo teste novo de rota/isolamento com D1 se chama `*.d1.test.ts` e usa a fixture "app com duas Lojas" (`@foode/db/testing`).

## Migrations (expand/contract no D1)

- Mudou `packages/db/src/schema/*.ts`? Gere a migration com `pnpm db:generate -- --name <nome>` e commite o SQL. O CI falha se schema e migrations divergirem.
- **Expand** só adiciona: tabela, índice, coluna nullable ou com `DEFAULT`.
- **Contract** (`DROP TABLE`/`DROP COLUMN`, `RENAME`, troca de tipo — que no SQLite vira recriação de tabela `__new_*`) vai num **PR separado**, depois que nenhum código no ar usa a estrutura antiga, e começa com a linha `-- contract: <motivo>`. Sem essa linha o lint recusa.
- Migration que já está na `master` é **imutável**: corrige-se com outra migration.
- Sem `BEGIN`/`COMMIT` (o wrangler já aplica cada migration numa transação) e sem `PRAGMA foreign_keys` (no D1: `PRAGMA defer_foreign_keys = on`).
- **Equivalente ao `lock_timeout`**: o D1 não tem `lock_timeout` — é single-writer, e enquanto uma migration roda toda escrita da produção espera. Por isso a migration é curta e só DDL: nada de backfill grande nem recriação de tabela populada dentro dela; backfill vai em lotes pequenos pelo código (ou em migrations separadas e limitadas), depois do expand.
- Problema em produção: rollback do **app** (redeploy da versão anterior), nunca do banco. O `db-migrate` registra o bookmark do Time Travel antes de aplicar, para emergência.
- Prova: todo PR cria um D1 remoto efêmero, aplica as migrations do zero, reaplica (idempotência), roda o seed duas vezes e apaga o banco (`if: always()`).

### Como rodar o `db-migrate`

```sh
gh workflow run db-migrate.yml --ref master -f confirmar=aplicar
# com migration contract pendente, depois da confirmação explícita do Dono:
gh workflow run db-migrate.yml --ref master -f confirmar=aplicar -f contract=sim
gh run watch "$(gh run list --workflow db-migrate.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

Ele aplica as migrations pendentes no `foode-prod`, roda o seed idempotente dos usuários `foode_ops` (variable/secret `FOODE_OPS_EMAILS`, sem senha) e dispara o `deploy.yml`. O deploy do push na `master` é **adiado** (job verde, aviso no resumo) enquanto houver migration pendente — o código novo nunca sobe antes do schema.

## CI/CD

- `ci.yml` (PR `opened`/`synchronize`/`reopened`/`ready_for_review` e push na `master`): lint, drift schema↔migrations, typecheck, testes sem banco, testes com D1 (workerd), build OpenNext + bundle da api, prova das migrations no D1 efêmero.
- `deploy.yml` (push na `master` e disparo pelo `db-migrate`): build, secrets do GitHub → Workers (`--secrets-file`; vazios são omitidos — Sentry ainda sem DSN), publica api → web → admin e roda o smoke (`/health`, Storefront, login do Painel, bindings). URLs do smoke: variables `SMOKE_API_URL`/`SMOKE_WEB_URL`/`SMOKE_ADMIN_URL` ou workers.dev da conta.
- Secrets do GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MILLIONSEND_API_KEY`, `SENTRY_DSN_API`/`SENTRY_DSN_WEB`/`SENTRY_DSN_ADMIN` (opcionais). Variables: `D1_PROD_DATABASE_ID`, `CLOUDFLARE_ZONE_ID`, `FOODE_OPS_EMAILS`.
- Custom domains (`foodedelivery.com.br`, `admin.`, `api.`) entram no Ticket 25, quando a zona ficar ativa.
