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

## Design (supersede parcial de [26](26-estrutura-monorepo.md))

- **Fonte visual do MVP:** tokens e princípios de [DESIGN.md](../DESIGN.md) (canvas, ink, primary/Rausch, radii, um shadow tier, tipografia modest weights) aplicados **onde o domínio Foode permitir**.
- **Não copiar** componentes de hospedagem Airbnb sem mapeamento (property-card, search-orb Homes/Experiences, Luxe/Plus).
- Mapear para Foode: botões, inputs, sheets/dialogs, listas, cards de **item de cardápio** / pedido — primitives shadcn + tokens CSS compartilhados.
- Estrutura: `packages/ui` (ou equivalente shadcn monorepo) + tokens em `packages/shared` / theme — ver [26](26-estrutura-monorepo.md) atualizado.
- Fonte: Cereal/Circular do DESIGN.md se licenciável; senão stack system documentada no DESIGN (evitar default Inter só por hábito, salvo substitute explícito do doc).

## Cron (ops)

- **4º “serviço” Railway = Cron** de reconciliação (hit autenticado na `api` ou job dedicado que sai).
- Os **3 apps** (`web`/`admin`/`api`) permanecem; o Cron não é worker sempre-on.
- Atualiza [25](25-hospedagem-ci-ops.md): cron = Railway Cron (não node-cron).

## Observabilidade

- Sentry free tier nos 3 apps desde o bootstrap (DSN em secrets Railway).
- Não implica Datadog/OTel completo.
