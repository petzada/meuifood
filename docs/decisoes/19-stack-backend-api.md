# Decisão: stack backend (`api`) e estilo de API

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #3  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md) · [18](18-stack-frontend.md)  
**Pesquisa:** [11](../pesquisa/11-stack-backend-multitenant-concorrentes.md), [13](../pesquisa/13-sintese-stack-mvp.md)

## Decisão

- Serviço **`api`**: **Node.js + TypeScript + Fastify**
- Contrato com `web` / `admin`: **REST + JSON**
- Validação de payload: **Zod** (ou equivalente) preferencialmente em package compartilhado do monorepo
- Webhooks (Woovi / Asaas) = rotas HTTP na mesma `api` (idempotência + worker/fila conforme grilling de pagamentos)

## Motivos

- Founder já fluente em Fastify + Node/TS → menor tempo e risco no MVP.
- REST idiomático para gateways e futuros integradores; evita contrato duplo tRPC+REST.
- NestJS adiado: overhead de DI/módulos sem time ainda.
- Hono rejeitado neste ciclo: ganho irrelevante na Railway frente à familiaridade Fastify.

## Escala (sem overbuild)

- MVP: um processo Fastify na Railway (HTTP + jobs leves no mesmo serviço se couber).
- Depois: extrair worker, Redis, filas — sem trocar framework.
- OpenAPI: opcional quando houver parceiro externo; não bloqueia o MVP.

## Rejeitado neste ciclo

- NestJS como framework principal.
- tRPC (ou GraphQL) como contrato principal `web`/`admin` ↔ `api`.
- Hono no lugar de Fastify só por “mais leve”.
