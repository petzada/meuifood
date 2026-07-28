# Tese de stack MVP — Foode Delivery

**Data:** jul/2026 · **Status:** entendimento compartilhado confirmado · **Marca:** provisional  
**Produto (não reabrir):** [16](16-tese-produto-fechada.md) · **Pesquisas:** [10](../pesquisa/10-stack-frontend-concorrentes.md)–[13](../pesquisa/13-sintese-stack-mvp.md)

## Em uma frase

Monorepo **pnpm** com **Next (`web` + `admin`)**, **Fastify (`api`)**, **Postgres/Auth/RLS/Storage no Supabase**, deploy **Railway** + CI GitHub → produção; pagamentos **Woovi + Asaas** com modo piloto MEI simples e caminho a BaaS.

## Confirmação

Founder confirmou entendimento compartilhado da stack MVP (jul/2026). Implementação ainda **não** iniciada até gate de libs/ops pós-confirmação.

## Índice do ciclo stack

| # | Arquivo | Tema |
| --- | --- | --- |
| 17 | [monorepo + âncora infra](17-monorepo-e-infra-preferencias.md) | Monorepo; `web`/`admin`/`api`; Railway + Supabase |
| 18 | [frontend](18-stack-frontend.md) | Next.js App Router + React + TS |
| 19 | [backend API](19-stack-backend-api.md) | Fastify + REST/JSON + Zod |
| 20 | [tenant sem workspaces](20-tenant-mvp-sem-workspaces.md) | 1 CNPJ = 1 loja; workspaces pós-MVP |
| 21 | [banco / ORM / RLS](21-banco-orm-multitenant.md) | Shared schema + `store_id`; Prisma; RLS efetivo; RBAC na api |
| 22 | [auth](22-auth-lojista-e-consumidor.md) | Lojista e-mail/senha + convite; consumidor magic link + guest |
| 23 | [realtime pedidos](23-realtime-pedidos-polling.md) | Poll 10s + som; WS/SSE pós-MVP |
| 24 | [pagamentos](24-arquitetura-pagamentos.md) | Providers Woovi/Asaas; modos pilot/baas/merchant |
| 25 | [hospedagem / CI / ops](25-hospedagem-ci-ops.md) | 3 serviços Railway; GH Actions → prod; ops mínimos |
| 26 | [estrutura monorepo](26-estrutura-monorepo.md) | apps + `db` + `shared` (tokens); sem `ui` dia 1 |
| 27 | [fora do MVP](27-fora-mvp-tecnico.md) | Lista explícita do que não construir |
| 29 | [libs/ops acréscimos](29-libs-ops-acrescimos-mvp.md) | Tailwind, shadcn+DESIGN, Vitest, Railway Cron, Woovi SDK, Sentry |

## Mapa mental

```
foodedelivery.com.br          → apps/web     (Next + Tailwind)
admin.foodedelivery.com.br    → apps/admin   (Next + Tailwind)
api.foodedelivery.com.br      → apps/api     (Fastify)
Railway Cron                  → reconciliação (exit)
         │
         ├─ packages/db      (Prisma)
         ├─ packages/shared  (Zod + tokens DESIGN.md)
         ├─ packages/ui      (shadcn seletivo)
         └─ Supabase         (Postgres + RLS + Auth + Storage)
```

## Âncoras de produto que a stack respeita

- Canal próprio web `/loja/[slug]` · guest + conta · dono/operador · PIX/crédito/débito/voucher ([32](32-taxas-e-assinatura-fixa-unica.md)) · piloto MEI · assinatura R$ 179 · sem workspaces no MVP · WhatsApp só `wa.me`.

## Próximo passo

Entendimento compartilhado **confirmado**. Gate libs/ops **fechado** ([29](29-libs-ops-acrescimos-mvp.md), pesquisa [14](../pesquisa/14-viabilidade-stack-e-libs-mvp.md)).

Antes do bootstrap: fronteira de lacunas **fechada** ([30](30-grilling-lacunas-e-contrapontos.md), [31](31-definicao-operacional-gmv.md)–[45](45-cupom-conta-e-fidelidade-pos-mvp.md)). Glossário: [`CONTEXT.md`](../../CONTEXT.md). Brand: [FOODE-BRAND.md](../FOODE-BRAND.md). ADRs: [`docs/adr/`](../adr/).
