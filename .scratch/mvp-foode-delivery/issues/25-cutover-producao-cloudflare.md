# 25 — Colocar a stack Cloudflare em produção e desligar Supabase e Railway

**What to build:** Os domínios do Foode passam a apontar para os Workers, o D1 de produção recebe o seed do Comerciante-modelo e Supabase, Railway e o código legado saem do repositório e das contas.

**Blocked by:** 24 — Portar horários, Pausa, Pedido Guest e Delivery para a stack nova.

**Status:** ready-for-agent

- [ ] Domínios do Storefront, Painel e API configurados como custom domains dos Workers; HTTPS e redirecionamentos conferidos.
- [ ] Secrets de produção (`wrangler secret`) e variáveis por ambiente documentados em `.env.example`, sem valores.
- [ ] Migrations aplicadas no D1 de produção pelo `db-migrate`; seed do Comerciante-modelo aplicado.
- [ ] Smoke pós-deploy no CI: `/health`, Storefront do Comerciante-modelo, login do Painel e um Pedido Guest em `on_delivery`.
- [ ] Código e dependências de Fastify, Prisma, `pg`, `@supabase/*`, `@aws-sdk/*` (se substituído por binding), scripts de preflight/sync Supabase e o job `migrate` antigo removidos.
- [ ] PR [petzada/meuifood#19](https://github.com/petzada/meuifood/pull/19) fechado sem merge, com comentário apontando os Tickets 26 e 27.
- [ ] Projeto Supabase pausado/excluído e serviços Railway desligados pelo Dono (passo manual registrado aqui).
- [ ] README e `AGENTS.md` descrevem só a stack nova.

## Comments

- 2026-11-04 — Aberto no pivô. Os dados do Supabase são descartados ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)); não há migração de dados.
