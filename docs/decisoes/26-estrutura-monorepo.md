# Decisão: estrutura do monorepo

**Data:** jul/2026 · **Status:** decidido (revisado pós gate libs) · **Sessão:** grilling stack #9 + [29](29-libs-ops-acrescimos-mvp.md)  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md) · **Design:** [FOODE-BRAND.md](../FOODE-BRAND.md) · [37](37-brand-foode-ui-outline-taste.md) · densidade via [DESIGN.md](../DESIGN.md)

## Histórico

- Grilling #9: sem `packages/ui` no dia 1 (DESIGN.md = Airbnb; pouco overlap com Foode).
- **Revisão libs:** Tailwind + shadcn.
- **Grilling #C:** marca = logo Foode + UI outline; DESIGN.md só densidade — [37](37-brand-foode-ui-outline-taste.md).

## Decisão (estrutura MVP)

```
apps/web          # Next storefront /loja/[slug] + Tailwind
apps/admin        # Next painel + Tailwind
apps/api          # Fastify
packages/db       # Prisma schema + client
packages/shared   # Zod/tipos + tokens CSS (FOODE-BRAND.md)
packages/ui       # primitives shadcn outline-first + primary Foode
```

- Tooling: **pnpm** workspaces; Turborepo **não** obrigatório.
- shadcn: componentes **seletivos**; theme = tokens Foode; containers **sem fill/shadow**.
- Domínio Airbnb puro (search-orb, property-card, …) **fora**.

## Rejeitado

- Monorepo flat sem packages.
- Importar o catálogo Airbnb / Rausch como marca Foode.
- Duplicar Prisma/Zod em cada app.
