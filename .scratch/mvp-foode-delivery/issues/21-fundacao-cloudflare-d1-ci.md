# 21 — Fundar a stack Cloudflare: Workers, D1 e CI/CD

**What to build:** Os três apps sobem como Workers (web e admin via OpenNext, api em Hono) com D1 + Drizzle, a camada de dados escopada por Loja e o pipeline novo — D1 efêmero no PR, deploy no merge e migration de produção sob pedido — substituindo Railway e Supabase como base de tudo que vem depois.

**Blocked by:** — (primeiro da fila do pivô; decisões [59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md) e [ADR 0006](../../../docs/adr/0006-cloudflare-workers-d1-sem-rls.md)).

**Status:** ready-for-agent

- [ ] `apps/api` roda em Hono num Worker com `/health`; o fetch público expõe só Storefront, webhooks e `/health`; operações do Painel ficam num entrypoint acessível apenas por service binding.
- [ ] `apps/web` e `apps/admin` rodam via OpenNext com `wrangler.jsonc` próprio e service binding para a `api`.
- [ ] D1 de produção criado; `packages/db` usa Drizzle, gera migrations SQL aplicadas por `wrangler d1 migrations` e define o padrão de datas, enums (`CHECK`) e dinheiro em centavos.
- [ ] Schema base de Loja e membership portado dos Tickets 02/03 (Slug global, `store_id` canônico); seed do Comerciante-modelo.
- [ ] `packages/db` só exporta operações que recebem contexto de Loja derivado do servidor; regra de lint impede rotas de acessarem o D1 diretamente.
- [ ] Teste de vazamento com duas Lojas sintéticas prova que nenhuma operação lê ou altera outra Loja, inclusive por id adivinhado.
- [ ] CI: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) roda lint, typecheck, build e testes; testes com banco criam, migram e apagam um D1 efêmero da run (inclusive em falha). Nenhum banco local.
- [ ] Merge na `master` faz deploy dos três Workers pelo CI; nada é publicado do notebook.
- [ ] Workflow manual `db-migrate` (`confirmar=aplicar`) aplica migrations no D1 de produção; check `migration-guard` fica vermelho enquanto houver migration pendente. Política expand/contract documentada no `AGENTS.md`.
- [ ] Todo job com `timeout-minutes` e `concurrency` por PR; cache de pnpm e do build do Next.
- [ ] `lefthook` no padrão global (pre-commit: formatter + lint com cache nos staged; pre-push: typecheck + `test:related`) e scripts `typecheck`, `lint`, `test`, `test:related`, `test:ci`, `e2e`, `build`.
- [ ] `AGENTS.md` do repositório traz o fluxo de git global (commit+push na branch, PR e pronto só no "finaliza", produção só sob pedido).
- [ ] Sentry via `@sentry/cloudflare` (api) e OpenNext (web/admin); R2 do Cardápio acessado por binding.
- [ ] `python -I ~/.claude/hooks/check-repo-standard.py <repo>` passa.

## Comments

- 2026-11-04 — Aberto no pivô. Absorve o Ticket 17 (drift e prova de RLS deixam de existir) e os achados 18.4 (fixture de teste de rota com duas Lojas), 18.5, 19.9 e 19.11. O comportamento dos Tickets 01–04 é a referência; o código de Fastify/Prisma/Supabase é a fonte a portar, não a reaproveitar.
- Rejeitado aqui: Miniflare/D1 local como requisito de teste, staging, Docker.
