# Decisão: marca Foode, UI outline e taste-skill

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #C  
**Tokens:** [FOODE-BRAND.md](../FOODE-BRAND.md) · **Supersede parcial:** primary Airbnb/Rausch em [29](29-libs-ops-acrescimos-mvp.md)

## 1) Marca e tokens

- Logo oficial Foode = **fonte de `colors.primary` e accent**.  
- Primary: **`#F35050`** · Accent gema: **`#FFB800`** · On-primary: **`#FFFFFF`**.  
- Tipografia UI: sans geométrica arredondada (**Nunito** ou equivalente); wordmark = asset.  
- [DESIGN.md](../DESIGN.md) permanece como referência de **densidade, spacing, hierarquia tipográfica modesta e canvas/ink** — **não** como marca (sem Rausch, sem property-card/search-orb).

Detalhe dos tokens: [FOODE-BRAND.md](../FOODE-BRAND.md).

## 2) Linguagem de containers (base UI)

Em storefront e painel:

- Containers (`div`/seções de conteúdo): **borda fina**, **sem fundo preenchido**, **sem shadow**.  
- Cantos **arredondados / circulares**; conteúdo fica **dentro** desses outlines.  
- CTAs primary podem ter fill brand; “cards” de listagem = outline only.

## 3) Skill obrigatória na construção de telas

Na hora de **construir/implementar telas**, usar:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
```

Objetivo: evitar AI slop, manter **simplicidade** e alinhar a esta decisão + [FOODE-BRAND.md](../FOODE-BRAND.md). Agentes de UI devem carregar `design-taste-frontend` antes de gerar layouts.

## 4) Bootstrap (`packages/shared` / shadcn)

- Theme CSS aponta para tokens Foode (não Rausch).  
- shadcn seletivo ([29](29-libs-ops-acrescimos-mvp.md)) com variants outline-first.  
- Asset do logo versionado no monorepo na implementação (pasta de brand assets).

## Rejeitado

- Primary Rausch (`#ff385c`) como marca Foode.  
- Copiar catálogo Airbnb (property-card, search-orb, Luxe/Plus).  
- Cards com fill + multi-shadow como default.  
- Construir telas sem taste-skill / com estética genérica “AI purple/cream”.
