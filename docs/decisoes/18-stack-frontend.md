# Decisão: stack frontend (storefront + painel)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #2  
**Depende de:** [17 monorepo/infra](17-monorepo-e-infra-preferencias.md) · **Pesquisa:** [10](../pesquisa/10-stack-frontend-concorrentes.md), [13](../pesquisa/13-sintese-stack-mvp.md)

## Decisão

- **Next.js (App Router) + React + TypeScript** nos apps **`web`** (storefront) e **`admin`** (painel).
- Storefront usa **SSR** (e estáticos onde couber) no path `/loja/[slug]` — share WhatsApp, SEO leve, first paint mobile.
- Painel: Next no mesmo ecossistema; páginas autenticadas podem ser majoritariamente client-driven (não forçar SSR de dashboard).

## Motivos

- Familiaridade do founder com React/Next.
- Alinha ao monorepo com apps separados ([17](17-monorepo-e-infra-preferencias.md)).
- Deploy na **Railway** (âncora já fechada) — Next não depende de Vercel.
- Segmento: React/Next é caminho comum e amigável a agentes de código.

## Fora / depois

- PWA “instalar na tela” — opcional pós-MVP se engajamento pedir.
- App nativo consumidor ou lojista — fora (tese produto).
- Vue/Nuxt ou Vite SPA pura como shell principal — rejeitados neste ciclo.

## Nota de fronteira

Lógica de negócio pesada (pedidos, pagamentos, webhooks) vive na **`api`**, não em Route Handlers “de produção” do Next — Next consome a API. Exceções mínimas (BFF fino) só se o grilling de backend permitir explicitamente.
