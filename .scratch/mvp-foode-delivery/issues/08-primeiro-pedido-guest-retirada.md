# 08 — Concluir o primeiro Pedido Guest na Retirada

**What to build:** Um Guest monta o carrinho, escolhe Retirada e Pagamento na entrega, conclui um Pedido com total recalculado pela API e o acompanha enquanto Dono ou Operador trabalha a fila do Painel com polling e som.

**Blocked by:** 06 — Configurar Complementos e montar o carrinho; 07 — Aplicar horários e Pausa no Canal próprio.

**Status:** needs-review

- [x] Guest informa nome e telefone, não precisa de e-mail ou conta e não informa endereço para Retirada.
- [x] A Loja precisa ter Retirada ativa e estar aberta e sem Pausa no momento da criação.
- [x] A API recalcula itens, escolhas e total em centavos e rejeita preço ou disponibilidade adulterados.
- [x] `on_delivery` cria Pedido sem provider, cobrança, taxa online ou Ledger.
- [x] Retry da mesma intenção não cria Pedido duplicado.
- [x] Dono e Operador veem o Pedido, seus snapshots e somente as transições válidas de Retirada.
- [x] A fila consulta HTTP no carregamento e a cada 10 segundos e toca som uma única vez por Pedido realmente novo.
- [x] O Consumidor acompanha o status no Canal próprio e pode abrir `wa.me` sem bot ou envio automático.
- [x] Pedido de outra Loja permanece inacessível no Storefront e no Painel.

## Comments

- 2026-07-28 — Implementação na branch
  `cursor/primeiro-pedido-guest-retirada-391f`: migrations
  `20260728233000_ticket_08_pedido_guest_retirada` e
  `20260728234000_ticket_08_order_enum_grants` (USAGE dos enums para
  `foode_business`), recálculo server-side atômico, idempotência Stripe-like,
  máquina de estados Retirada, checkout Guest, tracking opaco, fila do Painel
  com poll 10s + som com baseline.
- Decisões de implementação menores (spec Further Notes): telefone BR E.164
  celular `55+DDD+9xxxxxxxx`; token opaco `base64url` ≥32; `public_code` hex 6;
  toggle UI de Retirada fica no Ticket 09 (coluna default `true`).
- Evidência local: `pnpm lint`, `pnpm typecheck`, `pnpm test:quality`,
  `pnpm build` e `db:migrations:validate` verdes.
- 2026-07-29 — CI da PR #17 (`30411071453`) verde no commit `7ab210e`:
  `quality` passou; `migrate` aplicou as migrations pelo fluxo da Decisão 55;
  `integration` passou com `order-routes.test.ts` (criação Guest, idempotência,
  Loja pausada/Retirada inativa/cross-item, Dono/Operador + snapshots imutáveis
  + isolamento cross-store) no Supabase de produção. Checklist completo com
  evidência; `Status: needs-review` para aceite humano.
