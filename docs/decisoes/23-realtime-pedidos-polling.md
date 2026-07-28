# Decisão: realtime de pedidos no painel

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #6  
**Depende de:** [09](09-ciclo-pedido-status.md), [19](19-stack-backend-api.md)  
**Pesquisa:** [11](../pesquisa/11-stack-backend-multitenant-concorrentes.md), [13](../pesquisa/13-sintese-stack-mvp.md)

## Decisão (MVP)

- Painel `admin`: **polling HTTP na `api` a cada 10s** na lista de pedidos da loja (`store_id`).
- **Aviso sonoro** no MVP quando o polling detectar **pedido novo** (e, se fizer sentido na UX, mudança relevante de status vinda do consumidor/pagamento — mínimo = novo pedido).
- Sem WebSocket, SSE ou Supabase Realtime no caminho crítico do MVP.

## Pós-MVP (registrado)

- Evoluir para **WebSocket ou SSE na Fastify** (sala/canal por loja), se latência/carga do poll ou UX de cozinha pedirem.
- Não adotar Supabase Realtime como default dessa evolução (manter o hub de eventos na `api`), salvo reavaliação explícita.

## Motivos

- Escala regional ~10 lojas: poll de 10s é suficiente e simples na Railway.
- Alinha à síntese de mercado (muitos “tempo real” = poll).
- RLS/RBAC e fonte de verdade continuam na `api` + Prisma.

## Rejeitado no MVP

- WebSocket/SSE/Supabase Realtime como dependência do go-live.
- Polling agressivo (&lt; ~5s) sem dor medida.
