# Decisão: estrutura do monorepo

**Data:** jul/2026 · **Status:** decidido (revisado pós gate libs) · **Sessão:** grilling stack #9 + [29](29-libs-ops-acrescimos-mvp.md)  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md) · **Design:** [DESIGN.md](../DESIGN.md) · [29](29-libs-ops-acrescimos-mvp.md)

## Histórico

- Grilling #9: sem `packages/ui` no dia 1 (DESIGN.md = Airbnb; pouco overlap com Foode).
- **Revisão:** founder acrescentou Tailwind + shadcn + alinhamento DESIGN.md em **web e admin** → justifica package de UI/tokens compartilhados.

## Decisão (estrutura MVP)

```
apps/web          # Next storefront /loja/[slug] + Tailwind
apps/admin        # Next painel + Tailwind
apps/api          # Fastify
packages/db       # Prisma schema + client
packages/shared   # Zod/tipos + tokens CSS (DESIGN.md → variáveis)
packages/ui       # primitives shadcn alinhados aos tokens (Button, Input, Dialog, Sheet, Table, …)
```

- Tooling: **pnpm** workspaces; Turborepo **não** obrigatório.
- shadcn: componentes **seletivos**; theme aponta para tokens de `shared`.
- Domínio Airbnb puro (search-orb, property-card de listing, product tabs Homes/…) **fora** — só o que mapear a cardápio/checkout/painel.

## Rejeitado

- Monorepo flat sem packages.
- Importar o catálogo Airbnb inteiro como “design system Foode”.
- Duplicar Prisma/Zod em cada app.
