# Viabilidade da stack MVP + libs/ops que combinam

**Data:** jul/2026 · **Tipo:** pesquisa técnica (não é decisão) · **Stack de referência:** tese fechada (monorepo pnpm · Next web/admin · Fastify API · Supabase+Prisma+RLS · Railway · Woovi/Asaas)

**Escopo:** validar se a stack já fechada é **viável em 2026** e listar libs/ops que **combinam** sem reinventar produto/stack. Sem implementação.

---

## Veredito de viabilidade

A stack MVP fechada é **viável em 2026** para um SaaS cardápio/delivery BR solo/pequeno: Next App Router em Railway com `output: "standalone"` é documentado e usado em produção; Fastify + Prisma + Postgres Supabase é combinação madura; Auth Supabase cobre lojista (senha), operador (invite admin) e consumidor (magic link); pagamentos via Woovi SDK oficial + Asaas HTTP tipado; polling 10s + 3 serviços Railway + cron de reconciliação evita Redis/worker no dia 0. O maior risco técnico não é “a stack não roda” — é **RLS efetivo com Prisma** (role/BYPASSRLS + `SET LOCAL` em transação) e **disciplina operacional** (standalone Next, pooler, invite só via service_role Auth Admin, sem staging).

**Riscos reais (não teóricos):**

- **Prisma “respeitar RLS” exige role sem `BYPASSRLS` + contexto por request em transação** — conectar como `postgres`/owner anula policies mesmo com `ENABLE ROW LEVEL SECURITY`.
- **Leak de `set_config` sem `is_local=true` / fora de `$transaction`** em pool → contexto de loja A vaza para request B.
- **Next self-hosted no Railway:** obrigatório `output: "standalone"` + start no `server.js`; Image Optimization / cache ISR sem Redis é ok no MVP, mas cold/rebuild e custo de 2 Next (web+admin) pesam.
- **Auth split:** `@supabase/ssr` no Next ≠ verify JWT na API Fastify — dois padrões, um contrato (Bearer JWT → claims → `store_id`/RBAC).
- **Invite operador** usa `auth.admin.inviteUserByEmail` (**service_role** só Auth Admin) — não conflita com “queries de negócio sem service_role”, mas é fácil errar e reusar o mesmo client no Prisma.
- **Cron de reconciliação vs “3 serviços”:** Railway Cron = serviço que sobe, roda e **sai**; ou `node-cron` dentro da API. Escolher um e não misturar (ver tabela).
- **Sem staging + GH → prod:** risco operacional alto em pagamentos/ledger; mitigação mínima = migrate pre-deploy + smoke manual, não nova stack.
- **Incerteza:** maturidade de SDKs Asaas Node “oficiais” é confusa (Java oficial; Node = community/variável) — preferir `fetch` + Zod no MVP se SDK parecer frágil.

**Conflitos com decisões fechadas:** nenhum bloqueante. Tensão leve: “3 serviços Railway” ↔ cron dedicado (4º serviço short-lived) — resolvível com cron na API ou aceitar 4º serviço só para reconciliação.

---

## Tabela: libs/ops candidatas

| Lib / ops | Para quê | Esforço | Recomenda MVP? |
| --- | --- | --- | --- |
| **Zod** (já decidido) | Validação request/response API + forms | — | **sim** (fechado) |
| **`@supabase/ssr`** | Cookies/session refresh no Next (web + admin) | baixo | **sim** |
| **`jose` (JWKS)** ou `@fastify/jwt` + JWKS | Verificar JWT Supabase na API (ES256/JWKS default em projetos novos) | baixo–médio | **sim** |
| **Prisma Client + `$transaction` + `set_config(..., true)`** | RLS efetivo por request (`store_id` / claims) | médio (cuidado) | **sim** (padrão obrigatório da tese) |
| **`@supabase/supabase-js` Storage** | Upload fotos cardápio (signed URL ou client autenticado) | baixo | **sim** |
| **`@woovi/node-sdk`** | PIX charges/webhooks OpenPix/Woovi | baixo | **sim** |
| **Asaas via `fetch` + schemas Zod** | Cartão / cobranças; evita SDK Node instável | baixo–médio | **sim** |
| **SDK Asaas community** (`asaas`, `@rodrigogs/asaas-sdk`, etc.) | Atalho tipado Asaas | baixo | **não** (salvo se founder validar manutenção; Java é o oficial) |
| **Tailwind CSS** | Utility-first mobile cardápio + admin sem DS | baixo | **sim** |
| **shadcn/ui (cópia seletiva)** | Poucos primitives (Dialog, Sheet, Table) no admin | baixo–médio | **talvez** (só admin; não “design system”) |
| **Turborepo** | Cache/orquestração build monorepo | médio | **não** (pnpm `-r` / `--filter` basta com 5 packages) |
| **Railway Cron** (serviço exit) | Reconciliação `payment_events` D+N | baixo ops | **talvez** (preferível a worker Redis; tensiona “3 serviços”) |
| **`node-cron` na API** | Mesmo job sem 4º serviço | baixo | **talvez** (ok dia 0; menos isolado que Railway Cron) |
| **Vitest** | Testes unitários Zod/ledger/helpers | baixo | **sim** (mínimo: money/ledger + parsers webhook) |
| **OpenAPI gen** (`fastify-type-provider-zod` / swagger) | Docs API + client gen | médio | **não** (REST enxuto; Zod basta no MVP) |
| **Redis / Bull / worker** | Filas | alto | **não** (já fora) |
| **Sentry** | APM/erros | baixo | **não** dia 0 (pode ser 1ª pergunta pós-piloto) |
| **Supabase Realtime / WS / SSE** | Pedidos live | médio | **não** (polling 10s fechado) |
| **tRPC / GraphQL** | API typed end-to-end | alto | **não** (REST+Zod fechado) |
| **NestJS** | Framework API | alto | **não** (Fastify fechado) |
| **Vercel** | Hosting Next | — | **não** (Railway fechado) |

---

## Armadilhas concretas

### Prisma + RLS (Supabase)

1. **Role de conexão:** `postgres` / owner costuma ter `BYPASSRLS`. App runtime deve usar role **sem** bypass (ex.: `app_runtime`); migrations com `DIRECT_URL`/superuser separado.
2. **`SET LOCAL` / `set_config(name, value, true)` dentro de `$transaction`:** sem transação, Prisma pode trocar conexão do pool e o setting some ou vaza.
3. **Extensão “wrap every query”:** exemplo oficial Prisma RLS avisa que `$transaction` explícito aninhado pode quebrar — desenhar **um** helper `withStoreContext(storeId, fn)` por request HTTP.
4. **Só claims sem `SET LOCAL ROLE`:** policies `TO authenticated` não batem se a sessão continua como role dona das tabelas.
5. **Pooler:** Prisma Client + Supavisor transaction mode (`?pgbouncer=true` / porta 6543) + `DIRECT_URL` para migrate. Settings de sessão sem `LOCAL` são armadilha clássica com poolers.
6. **service_role:** permitido só Auth Admin (invite) e talvez Storage admin pontual — **nunca** nas queries de pedido/cardápio/ledger.

### Next.js + Railway

1. **`output: "standalone"`** + `node .next/standalone/server.js` (e copiar `static`/`public` se Docker).
2. **Monorepo pnpm:** build filter por app (`pnpm --filter @foode/web build`); Railway root directory / install command explícitos por serviço.
3. **Dois Next (web + admin):** dobro de memória/custo vs full-stack único — aceito pela tese; monitorar RAM no plano Railway.
4. **Pre-deploy:** `prisma migrate deploy` no serviço que “dona” o schema (api ou job) — não em paralelo nos 3 sem coordenação.
5. **Env `NEXT_PUBLIC_*`:** rebuild necessário para mudança; secrets de gateway só na API.
6. **Sem Redis:** ISR/cache em filesystem some no redeploy — irrelevante se cardápio for SSR/dinâmico por slug.

### Auth (padrões que combinam)

| Superfície | Padrão 2026 | Nota |
| --- | --- | --- |
| Next web/admin | `@supabase/ssr` + middleware/proxy refresh + `getClaims()` no server | Não usar `getSession()` sozinho para autorização |
| Fastify API | Bearer access token → `jose`/`jwtVerify` JWKS (`…/auth/v1/.well-known/jwks.json`) → claims → RBAC dono/operador em tabela app | Evitar confiar só em decode sem verify |
| Convite operador | `supabase.auth.admin.inviteUserByEmail` (service_role **só** neste path) + row `store_members(role)` | Redirect allowlist; expiração = Email OTP expiration |
| Consumidor | Magic link + guest; link guest→conta no app | Email via templates Supabase Auth |

---

## O que NÃO adicionar no MVP (overkill / conflito)

- Redis, filas, worker sempre-on, Sentry, OpenTelemetry completo  
- Turborepo/Nx, design system completo, Storybook  
- OpenAPI/codegen, tRPC, Nest, Prisma Accelerate (salvo dor de pool)  
- Supabase Realtime / WS / SSE (pós-MVP)  
- SDK Asaas Node sem dono claro; Meta WhatsApp API; staging environment completo  
- `service_role` no Prisma Client de rotas de negócio  

---

## Até 6 candidatos a ACRESCENTAR (perguntar ao founder)

1. **Tailwind** nos dois Next — sim/não (default recomendado: sim).  
2. **shadcn só no admin** (Sheet/Dialog/Table) vs CSS manual — evita overkill no cardápio.  
3. **Vitest** só para ledger/PIX webhook parsers — sim/não.  
4. **Cron:** Railway Cron (4º serviço exit) vs `node-cron` na API (mantém 3).  
5. **`@woovi/node-sdk` oficial** (quase certo) + **Asaas fetch+Zod** vs experimentar SDK community.  
6. **Sentry free tier na semana 2** (após 1ª loja piloto) — explícito fora do dia 0.

---

## Fontes / URLs

- Railway Next.js: https://docs.railway.com/guides/nextjs  
- Railway fullstack Next: https://docs.railway.com/guides/fullstack-nextjs  
- Railway Cron: https://docs.railway.com/cron-jobs · https://blog.railway.com/p/run-scheduled-and-recurring-tasks-with-cron  
- Prisma RLS extension example: https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security  
- Prisma + Supabase pooler: https://www.prisma.io/docs/orm/overview/databases/supabase  
- Prisma PgBouncer: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer  
- RLS + Prisma armadilhas (role/BYPASSRLS): https://dev.to/emil_alander_7c/does-prisma-respect-supabase-rls-no-heres-why-k53  
- Issue histórica SET/session: https://github.com/prisma/prisma/issues/5128  
- Supabase SSR client: https://supabase.com/docs/guides/auth/server-side/creating-a-client · https://github.com/supabase/ssr  
- Invite admin: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail  
- Woovi/OpenPix Node SDK: https://www.npmjs.com/package/@woovi/node-sdk · https://developers.woovi.com/docs/sdk/node/sdk-node-usage  
- Asaas Java oficial: https://github.com/asaasdev/asaas-api-sdk-java · docs: https://docs.asaas.com/  
- jose JWT verify: https://github.com/panva/jose  
- pnpm monorepo sem Turborepo: https://storyie.com/blog/monorepo-cicd-pnpm-github-actions  
- Síntese stack interna: [13-sintese-stack-mvp.md](./13-sintese-stack-mvp.md)
