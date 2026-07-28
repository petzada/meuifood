# Três apps: web, admin e api

Monorepo com **Next (`web`)**, **Next (`admin`)** e **Fastify (`api`)** em deploys separados na Railway — não um único Next full-stack.

A síntese de mercado ([pesquisa 13](../pesquisa/13-sintese-stack-mvp.md)) recomendava Caminho A (um Next com Route Handlers). Escolhemos o Caminho B porque webhooks Woovi/Asaas, idempotência, ledger e reconciliação cabem melhor num processo Node sempre-on; storefront e painel têm superfície de auth/SEO diferentes. Custo: três serviços e mais ops para founder solo — aceito em troca de fronteiras claras antes da escala nacional.

**Considered:** Next monolítico (Vercel/Railway) · NestJS · juntar admin+web no mesmo app Next.  
**Rejected:** monolítico como arquitetura-alvo; microsserviços de domínio no MVP.
