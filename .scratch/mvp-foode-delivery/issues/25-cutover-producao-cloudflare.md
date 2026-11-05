# 25 — Domínios, e-mail e remoção do legado (Supabase, Railway, Woovi)

**What to build:** Os domínios do Foode apontam para os Workers, o e-mail sai pelo domínio próprio, o código e as dependências da stack antiga saem do repositório e o projeto Supabase é pausado — deixando produção limpa antes dos pagamentos.

**Blocked by:** 24a — Storefront: checkout, Pedido e acompanhamento; 28 — Onboarding do Dono; 29 — Área Ops (para a fatia **25-infra**: domínios, DNS, MillionSend, Turnstile, Sentry); 24b — Painel: operação do Pedido (para a fatia **25-legado** e o smoke final).

**Status:** ready-for-agent

**Agente:** Opus (geral).

- [ ] Zona `foodedelivery.com.br` ativa (se ainda pendente, o orquestrador pede ao humano a troca de nameservers no Registro.br e aguarda); custom domains `foodedelivery.com.br`, `admin.` e `api.` ligados aos Workers por CLI.
- [ ] Registros da MillionSend (DKIM, MX/SPF de `nao-responda`, DMARC, CNAME `tracking` só DNS) obtidos pela API da MillionSend e criados no DNS da Cloudflare por CLI; domínio verificado; remetente `nao-responda@foodedelivery.com.br` ativo.
- [ ] Turnstile com hostnames finais (Storefront: checkout, busca por telefone e login do Consumidor; Painel: login, convite, reset); Sentry com releases e ambientes.
- [ ] Removidos: Fastify, Prisma, `pg`, `@supabase/*`, `@woovi/node-sdk`, `@aws-sdk/*` (se o binding R2 cobrir), scripts de preflight/sync Supabase, job `migrate` antigo, secrets Supabase do GitHub.
- [ ] Projeto Supabase `emdbvwylytduvuzvavgy` pausado pelo MCP do Supabase (dados descartados por decisão). Não há serviço Railway do meuifood a desligar (conferido em 2026-11-04).
- [ ] PR [petzada/meuifood#19](https://github.com/petzada/meuifood/pull/19) fechado sem merge, com comentário apontando os Tickets 26 e 27.
- [ ] README e `AGENTS.md` descrevem só a stack nova; `.env.example` lista as variáveis sem valores.
- [ ] Skill `.claude/skills/verificar-tickets` e `verification/STATUS.md` atualizados para a stack e a fila novas.
- [ ] Smoke em produção pelos domínios finais: Storefront, login do Painel, `/ops`, Pedido `on_delivery` numa Loja sintética de smoke (criada e removida pelo teste).
- [ ] Página estática `/privacidade` e links de acompanhamento do Pedido (usados no "Avisar no WhatsApp") apontam para o domínio final `foodedelivery.com.br`; `BETTER_AUTH_URL` e `MEDIA_PUBLIC_BASE_URL` trocados para os domínios finais.

## Comments

- 2026-11-04 — Revisado: produção já é publicada a cada ticket desde o 21; este ticket fecha domínios, e-mail e limpeza.

- 2026-11-05 — Critérios consolidados com 63–65: bloqueio dividido entre 24a (fatia 25-infra) e 24b (25-legado e smoke); Turnstile cobre a busca por telefone e o login do Consumidor; `/privacidade`, links de acompanhamento e URLs de Auth/mídia no domínio final. Os nomes da stack antiga continuam no critério de remoção porque ele é exatamente a limpeza deles.

- 2026-11-05 — Fatia **25-infra** (`feat/25-infra-391f`). Zona `foodedelivery.com.br` confirmada `active` (NS da Cloudflare). **Custom domains** como `routes` com `custom_domain: true` nos `wrangler.jsonc`: `foodedelivery.com.br` → `foode-web`, `admin.` → `foode-admin`, `api.` → `foode-api` — o próximo deploy da `master` cria os registros DNS e os certificados (workers.dev segue ligado como fallback). **`www`**: registro `AAAA 100::` proxied + Redirect Rule da zona (301 para o apex, caminho e query preservados), criados por API em 2026-11-05. **Vars**: `BETTER_AUTH_URL=https://admin.foodedelivery.com.br` (cookie host-only no Painel, sem `crossSubDomainCookies`; login só vale no domínio), `MEDIA_PUBLIC_BASE_URL=https://api.foodedelivery.com.br/media`, `STOREFRONT_ORIGIN=https://foodedelivery.com.br` (admin), `EMAIL_FROM=Foode <nao-responda@foodedelivery.com.br>` (`no-reply@` padronizado). **Smoke** do deploy nos domínios (24 × 10 s, para o certificado novo) e depois no workers.dev. **E-mail**: workflow `setup-email-dominio.yml` (`workflow_dispatch`, script `scripts/setup-email-dominio.mjs`): cadastra o domínio na MillionSend em `sa-east-1` (fixa na criação), cria/atualiza DKIM, SPF (MX + TXT do MAIL FROM `send.`), DMARC e CNAME `tracking` como DNS only, verifica e falha se DKIM/SPF não verificarem; idempotente, sem valores no log. Precisa estar na branch padrão para ser disparado: roda depois do merge. **Turnstile**: widget `foode-painel` já tem `foodedelivery.com.br` (cobre `admin.`/`www.`) e o workers.dev; sem mudança. Pendentes nesta fatia: rodar o `setup-email-dominio` após o merge; Sentry (DSNs, passo do Dono) segue adiado. Fatia 25-legado não começou.
