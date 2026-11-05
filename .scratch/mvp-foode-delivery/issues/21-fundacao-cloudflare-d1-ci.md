# 21 — Fundar a stack Cloudflare: Workers, D1, CI/CD e contas

**What to build:** Os três apps sobem como Workers (web e admin via OpenNext, api em Hono) com D1 + Drizzle e camada de dados escopada por Loja; o pipeline novo testa no CI, faz merge, migra e publica em produção por ticket; contas e recursos (zona DNS, D1, R2, Sentry, secrets) são criados por CLI/MCP.

**Blocked by:** — (primeiro da fila; decisões [59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md), [62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md), [ADR 0006](../../../docs/adr/0006-cloudflare-workers-d1-sem-rls.md)).

**Status:** ready-for-agent

**Agente:** Opus (geral).

- [ ] `apps/api` em Hono num Worker com `/health`; fetch público só para Storefront, webhooks e `/health`; operações do Painel num `WorkerEntrypoint` acessível só por service binding.
- [ ] `apps/web` e `apps/admin` via OpenNext, cada um com `wrangler.jsonc` e service binding para a `api`.
- [ ] D1 de produção criado por CLI; `packages/db` com Drizzle, migrations SQL aplicadas por `wrangler d1 migrations`; padrão de datas (UTC), enums (`CHECK`) e dinheiro em centavos.
- [ ] Schema base: Loja (estados `onboarding`/`active`/`suspended`, Slug global), membership multi-Loja (`owner`/`operator`), papel global `foode_ops`, auditoria.
- [ ] Seed de produção cria só o usuário `foode_ops` a partir de `FOODE_OPS_EMAILS` (sem senha no repo; acesso inicial por e-mail de definição de senha a partir do Ticket 22).
- [ ] `packages/db` só exporta operações com contexto de Loja derivado do servidor; lint impede acesso direto ao D1 fora dele.
- [ ] Fixture de teste "app com duas Lojas" e teste de vazamento (leitura e escrita cruzadas, id adivinhado).
- [ ] Testes de rota com `@cloudflare/vitest-pool-workers` rodando **só no CI**; `test:related` local exclui testes com D1.
- [ ] CI em `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) e `push` na `master`: lint, typecheck, build, testes; prova de migrations num D1 remoto efêmero (criar/aplicar/apagar com `if: always()`).
- [ ] Workflow `deploy` no push da `master`: sincroniza secrets do GitHub para os Workers, publica os três Workers e roda smoke (`/health` + Storefront + login).
- [ ] Workflow manual `db-migrate` (`confirmar=aplicar`) aplica migrations no D1 de produção; o orquestrador o dispara após cada merge com migration. Migrations expand/contract documentadas no `AGENTS.md`.
- [ ] `concurrency` por PR e `timeout-minutes` em todo job; cache de pnpm e do build do Next.
- [ ] `lefthook` (pre-commit formatter + lint com cache nos staged; pre-push typecheck + `test:related`) e scripts `typecheck`, `lint`, `test`, `test:related`, `test:ci`, `e2e`, `build`.
- [ ] `AGENTS.md` traz o fluxo de git global e a autorização de merge por ticket desta execução.
- [ ] Zona `foodedelivery.com.br` criada na Cloudflare por CLI; nameservers informados ao humano para trocar no Registro.br (não bloqueia o ticket; custom domains entram quando a zona ficar ativa).
- [ ] Sentry: projetos e DSNs criados por MCP; R2 por binding; secrets em `wrangler secret`/GitHub (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, DSNs).
- [ ] `python -I ~/.claude/hooks/check-repo-standard.py <repo>` passa; README declara Node 24.

## Comments

- 2026-11-04 — Aberto no pivô. Absorve o Ticket 17 e os achados 18.4, 18.5, 19.9 e 19.11. O comportamento dos Tickets 01–04 é a referência; Fastify/Prisma/Supabase são fonte a portar, não a reaproveitar.
- 2026-11-04 (revisão) — Testes D1 via pool-workers no CI; ciclo PR → merge → migrate → deploy → smoke autorizado por ticket ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)).
