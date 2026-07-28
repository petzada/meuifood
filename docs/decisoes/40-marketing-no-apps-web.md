# Decisão: marketing institucional no `apps/web`

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #F  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md), [15](15-url-slug-e-marca-provisional.md), [25](25-hospedagem-ci-ops.md)

## Decisão

- **Landing / site institucional** (marketing) vive no mesmo app **`apps/web`** (Next).  
- Rotas típicas: `/`, `/precos`, etc.  
- Produto da loja permanece em **`/loja/[slug]`**.  
- **Sem** 4º serviço Railway só para marketing.

## Motivo

Um deploy a menos no MVP; DNS `foodedelivery.com.br` → `web` já previsto em [25](25-hospedagem-ci-ops.md). Isolar marketing depois só se dor de SEO/release pedir.

## Rejeitado

- App/serviço separado só para landing no MVP.
