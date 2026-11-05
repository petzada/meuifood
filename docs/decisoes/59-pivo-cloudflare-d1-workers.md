# Decisão: tudo na Cloudflare — Workers, D1, Better Auth

**Data:** 2026-11-04 · **Status:** decidido · **Sessão:** pivô de infraestrutura (perguntas objetivas ao Dono)  
**ADR:** [0006](../adr/0006-cloudflare-workers-d1-sem-rls.md)

**Supersede:** ADR [0002](../adr/0002-railway-supabase-nao-vercel.md); hospedagem, banco, Auth, CI e Cron em [17](17-monorepo-e-infra-preferencias.md), [19](19-stack-backend-api.md), [21](21-banco-orm-multitenant.md), [22](22-auth-lojista-e-consumidor.md), [25](25-hospedagem-ci-ops.md), [28](28-tese-stack-mvp.md), [29](29-libs-ops-acrescimos-mvp.md); linha de migrations de [44](44-producao-only-sandbox-migrations-ci.md); [55](55-migrations-supabase-producao-ci.md); [56](56-excecao-master-sem-branch-protection.md); credenciais S3 de [57](57-cloudflare-r2-imagens-cardapio.md) (o R2 continua); Supabase magic link em [43](43-guest-conta-vinculo-pedido.md).

## Decisão

O Foode roda **inteiramente na Cloudflare**. Supabase (Postgres, Auth) e Railway (apps, Cron) saem.

| Peça | Antes | Agora |
| --- | --- | --- |
| Storefront (`web`) | Next standalone na Railway | Next no Worker via **OpenNext** (padrão do ceremony) |
| Painel (`admin`) | Next standalone na Railway | Next no Worker via **OpenNext** |
| API (`api`) | Fastify na Railway | **Hono** em Worker próprio; `admin` e `web` chamam por **service binding** |
| Banco | Supabase Postgres + RLS, Prisma | **D1** (SQLite) + **Drizzle**; isolamento por repositório escopado por `store_id` |
| Auth Dono/Operador/Consumidor | Supabase Auth | **Better Auth** na `api`, tabelas no D1 |
| E-mail transacional | Supabase Auth | **MillionSend** (SDK `resend`, base URL trocada — padrão do ceremony), remetente no domínio Foode |
| Imagens do Cardápio | R2 via SDK S3 com chaves | R2 via **binding** do Worker |
| Reconciliação | Railway Cron | **Cron Triggers** do Worker `api` |
| Observabilidade | `@sentry/node` + stdout Railway | `@sentry/cloudflare` + Workers Logs |

Os três apps de [ADR 0001](../adr/0001-tres-apps-web-admin-api.md) continuam; muda só onde rodam.

### Fronteira de exposição

- O fetch **público** da `api` atende somente: Storefront público (Cardápio, checkout, página do Pedido), webhooks dos provedores e `/health`.
- Operações do Painel ficam acessíveis **só pelo service binding** (RPC/`WorkerEntrypoint`), chamadas pelo servidor do `admin`. O navegador do Painel nunca fala direto com a `api`.
- Better Auth roda na `api`; o `admin` repassa `/api/auth/*` pelo binding para o cookie de sessão ficar no domínio do Painel (`httpOnly`, `Secure`, `SameSite=Lax`).
- RBAC Dono/Operador ([38](38-rbac-dono-operador-mvp.md)) continua no servidor, em middleware Hono.
- Checkout Guest e login usam **rate limit** nativo do Workers e **Turnstile**.
- Secrets por `wrangler secret` (sincronizados pelo CI a partir dos secrets do GitHub). Sem mTLS: o PIX é AbacatePay e o cartão Efí usa a API de Cobranças ([60](60-pagamentos-efi-abacatepay.md)).

### Banco e isolamento

- Um único D1 de produção. Sem RLS, roles nem GRANT: o isolamento vira **invariante de código** — `packages/db` só exporta operações que recebem o contexto da Loja, rotas não acessam o D1 diretamente (regra de lint) e há **testes de vazamento** com duas Lojas.
- O D1 não tem transação interativa. Escritas que dependem de leitura (Pausa/horário no Pedido, idempotência) usam `batch` atômico com `INSERT … SELECT` condicional e constraints `UNIQUE`; Durable Object por Loja só se a contenção exigir.
- Tipos: enums viram `CHECK`; datas em ISO-8601 UTC (`TEXT`) ou epoch ms (`INTEGER`), decididos no ticket de fundação; dinheiro continua em centavos inteiros.
- Os dados do Supabase são **descartados**; o D1 nasce limpo e o seed de produção cria só o usuário `foode_ops` ([62](62-escopo-ops-multiloja-funcionalidades.md)). Backup = D1 Time Travel.

### Testes

- Testes de rota, webhook e isolamento rodam com **`@cloudflare/vitest-pool-workers`** (workerd + D1 SQLite) **somente no runner do CI**. O pre-push local roda só testes sem banco (`test:related` filtrado).
- O CI também prova as migrations num **D1 remoto efêmero** (criar, aplicar, apagar — inclusive em falha).
- Depois de cada deploy, **smoke** contra produção (`/health`, Storefront, login do Painel).

### CI/CD e integração (autorizado pelo Dono para a execução do pivô)

- PR: lint, typecheck, build e testes (repositório **público**: CI completo sempre, sem custo).
- **Por ticket**: PR → CI verde → **squash merge na `master`** → `db-migrate` (migration em produção) → deploy dos três Workers pelo CI → smoke. O Dono autorizou em 2026-11-04 esse ciclo automático durante a execução dos tickets do pivô; migration **contract** continua exigindo confirmação explícita.
- Deploy só pelo CI (nunca do notebook). Migrations em **expand/contract**.
- `lefthook` no padrão global e scripts `typecheck`, `lint`, `test`, `test:related`, `test:ci`, `e2e`, `build`; `concurrency` e `timeout-minutes` em todo job.

### Domínio, DNS e contas

- `foodedelivery.com.br` passa para a Cloudflare (zona criada pelo `cf` CLI; o Dono troca os nameservers no Registro.br). Layout: `foodedelivery.com.br` (Storefront), `admin.foodedelivery.com.br` (Painel), `api.foodedelivery.com.br` (webhooks e rotas públicas).
- E-mail: conta MillionSend do ceremony com domínio remetente `nao-responda@foodedelivery.com.br`; registros DKIM/SPF/MX/DMARC/tracking obtidos pela API da MillionSend e criados no DNS da Cloudflare. A API key está no secret `MILLIONSEND_API_KEY` do GitHub.
- Sentry, Turnstile, D1, R2 e secrets dos Workers são criados por CLI/MCP/API; passo manual só quando não houver API.

## Por quê

O Dono já opera esse stack no ceremony (Workers, OpenNext, Efí com mTLS por binding, MillionSend). O modelo antigo aplicava migration no banco de produção a cada PR e gerou drift (CI da `master` vermelho desde 2026-10-27). Um D1 efêmero por run elimina o problema na raiz, sem banco local.

## Rejeitado

- Hyperdrive + Postgres externo (Neon etc.): o banco ficaria fora da Cloudflare.
- Um D1 por Loja: migrations N vezes e relatórios de Ops complexos para ~10 Lojas.
- Prisma + adapter D1: sem transação interativa e bundle maior no Worker.
- API dentro das rotas do Next: duplicaria regra e webhooks entre dois apps e derrubaria [ADR 0001](../adr/0001-tres-apps-web-admin-api.md).
- Clerk: serviço externo pago por usuário, fora da Cloudflare.
- Migrar os dados do Supabase: não há cliente real em produção.

## Impacto

- Tickets 01–09 (`done`) continuam válidos como **comportamento**; o código de banco, auth e API é portado nos Tickets 21–25.
- Ticket 17 fica superseded (o drift e a prova de RLS deixam de existir); achados aplicáveis de 18–20 viram critérios dos tickets de port.
