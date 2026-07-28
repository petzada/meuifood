# Decisão: libs e ops acrescentados ao MVP

**Data:** jul/2026 · **Status:** decidido · **Sessão:** gate pós-tese stack  
**Pesquisa:** [14](../pesquisa/14-viabilidade-stack-e-libs-mvp.md) · **Tese:** [28](28-tese-stack-mvp.md)

## Pacote confirmado pelo founder

| # | Item | Decisão |
| --- | --- | --- |
| 1 | **Tailwind CSS** | **Sim** — `web` + `admin` |
| 2 | **shadcn/ui (seletivo)** + alinhar com [DESIGN.md](../DESIGN.md) | **Sim** — em **todo o app onde viável** (cardápio **e** admin), não só admin |
| 3 | **Vitest** | **Sim** — mínimo (ledger, parsers webhook, helpers dinheiro) |
| 4 | **Cron de reconciliação** | **Railway Cron** (serviço short-lived / exit) — founder já no plano ~US$ 5; preferível a `node-cron` na API |
| 5 | **Pagamentos SDKs** | **`@woovi/node-sdk`** + Asaas via **`fetch` + Zod** (sem SDK Asaas community) |
| 6 | **Sentry** | **Sim** no MVP (free tier) — web, admin e api |

## Já implícitos na tese (bootstrap sem nova escolha)

- Zod · `@supabase/ssr` · verify JWT (`jose`/JWKS) na Fastify · `@supabase/supabase-js` Storage · helper Prisma `$transaction` + `set_config` (RLS efetivo)

## Design (supersede parcial — ver [37](37-brand-foode-ui-outline-taste.md))

- **Fonte de marca do MVP:** logo Foode → tokens em [FOODE-BRAND.md](../FOODE-BRAND.md) (`primary` `#F35050`, accent `#FFB800`).  
- **Fonte de densidade/spacing:** princípios de [DESIGN.md](../DESIGN.md) (canvas/ink, radii modestos, hierarquia tipográfica leve) — **sem** Rausch / property-card / search-orb.  
- UI: containers **outline** (borda fina, sem fill, sem shadow) — [37](37-brand-foode-ui-outline-taste.md).  
- Telas: skill **`design-taste-frontend`** (Leonxlnx/taste-skill) na construção.  
- Estrutura: `packages/ui` + tokens em `packages/shared` — ver [26](26-estrutura-monorepo.md).  
- Fonte UI: Nunito (ou equivalente arredondado); wordmark = asset do logo.

## Cron (ops)

- **4º “serviço” Railway = Cron** de reconciliação (hit autenticado na `api` ou job dedicado que sai).
- Os **3 apps** (`web`/`admin`/`api`) permanecem; o Cron não é worker sempre-on.
- Atualiza [25](25-hospedagem-ci-ops.md): cron = Railway Cron (não node-cron).

## Observabilidade

- Sentry free tier nos 3 apps desde o bootstrap (DSN em secrets Railway).
- Não implica Datadog/OTel completo.
