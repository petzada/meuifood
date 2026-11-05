# 25 — Domínios, e-mail e remoção do legado (Supabase, Railway, Woovi)

**What to build:** Os domínios do Foode apontam para os Workers, o e-mail sai pelo domínio próprio, o código e as dependências da stack antiga saem do repositório e o projeto Supabase é pausado — deixando produção limpa antes dos pagamentos.

**Blocked by:** 24 — Portar horários, Pausa, Pedido Guest, Delivery e impressão; 28 — Onboarding do Dono; 29 — Área Ops.

**Status:** ready-for-agent

**Agente:** Opus (geral).

- [ ] Zona `foodedelivery.com.br` ativa (se ainda pendente, o orquestrador pede ao humano a troca de nameservers no Registro.br e aguarda); custom domains `foodedelivery.com.br`, `admin.` e `api.` ligados aos Workers por CLI.
- [ ] Registros da MillionSend (DKIM, MX/SPF de `nao-responda`, DMARC, CNAME `tracking` só DNS) obtidos pela API da MillionSend e criados no DNS da Cloudflare por CLI; domínio verificado; remetente `nao-responda@foodedelivery.com.br` ativo.
- [ ] Turnstile com hostnames finais; Sentry com releases e ambientes.
- [ ] Removidos: Fastify, Prisma, `pg`, `@supabase/*`, `@woovi/node-sdk`, `@aws-sdk/*` (se o binding R2 cobrir), scripts de preflight/sync Supabase, job `migrate` antigo, secrets Supabase do GitHub.
- [ ] Projeto Supabase `emdbvwylytduvuzvavgy` pausado pelo MCP do Supabase (dados descartados por decisão). Não há serviço Railway do meuifood a desligar (conferido em 2026-11-04).
- [ ] PR [petzada/meuifood#19](https://github.com/petzada/meuifood/pull/19) fechado sem merge, com comentário apontando os Tickets 26 e 27.
- [ ] README e `AGENTS.md` descrevem só a stack nova; `.env.example` lista as variáveis sem valores.
- [ ] Skill `.claude/skills/verificar-tickets` e `verification/STATUS.md` atualizados para a stack e a fila novas.
- [ ] Smoke em produção pelos domínios finais: Storefront, login do Painel, `/ops`, Pedido `on_delivery` numa Loja sintética de smoke (criada e removida pelo teste).

## Comments

- 2026-11-04 — Revisado: produção já é publicada a cada ticket desde o 21; este ticket fecha domínios, e-mail e limpeza.
