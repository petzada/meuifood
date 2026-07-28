# 01 — Bootstrapar monorepo e identidade Foode

**What to build:** Um checkout novo instala o workspace pnpm e executa os três apps e três packages. O Storefront publica uma landing institucional mínima com a identidade Foode, o Painel possui um shell coerente e a API expõe healthcheck, logging seguro e observabilidade desde o bootstrap.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] O workspace contém `web`, `admin` e `api`, além dos packages `db`, `shared` e `ui`, sem quarto app ou worker.
- [ ] Os dois apps Next usam App Router, TypeScript e Tailwind; a API usa Fastify, TypeScript, Zod e responde healthcheck JSON com status 200.
- [ ] Comandos pnpm na raiz executam desenvolvimento, lint, typecheck, testes e build nos workspaces relevantes e propagam falhas.
- [ ] Tokens Foode e primitives mínimas compartilhadas demonstram Primary `#F35050`, Nunito, CTA e container outline sem fill ou shadow.
- [ ] A landing comunica Canal próprio, R$ 179/mês e R$ 1.718,40/ano, sem marketplace, meter de GMV ou números superseded.
- [ ] Sentry é inicializado nos três apps quando configurado e não impede execução local sem DSN.
- [ ] Logs usam stdout e não expõem secrets, autorização, cookies, dados de cartão ou dados pessoais desnecessários.
- [ ] Não entram Vercel, staging, preview, Redis, WebSocket, SSE, Rausch ou catálogo Airbnb.

