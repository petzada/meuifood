# 13 — Conta do Consumidor, Cupom de boas-vindas e Cupons promocionais

**What to build:** O Guest cria conta por magic link após o Pedido e recupera Pedidos da mesma Loja; o Dono configura o Cupom de boas-vindas e Cupons promocionais, aplicados e recalculados no servidor no checkout.

**Blocked by:** 24 — Portar horários, Pausa, Pedido Guest, Delivery e impressão.

**Status:** ready-for-agent

**Agente:** Opus para API/regras; Fable para telas de cupom (Painel) e conta (Storefront), após o contrato.

- [ ] Conta de Consumidor por magic link do Better Auth via MillionSend, separada da identidade de membro; rate limit e Turnstile.
- [ ] Vínculo do Pedido por e-mail + confirmação do telefone, sem recriar o Pedido; recuperação só de Pedidos da mesma Loja e telefone normalizado.
- [ ] Novo Pedido autenticado já nasce ligado à conta, sem impedir Guest.
- [ ] Cupom de boas-vindas opt-in (R$ ou %), emitido só com programa ativo, uso único.
- [ ] Cupons promocionais: código único por Loja, % ou R$, validade, limite total de usos, pedido mínimo, ativo/inativo.
- [ ] Um Cupom por Pedido; desconto recalculado no servidor, nunca abaixo de zero, não incide sobre a taxa de Delivery; adulteração rejeitada; uso contado de forma atômica com o Pedido.
- [ ] Ledger e taxa Foode usam o total efetivamente pago.
- [ ] Operador não vê nem altera Cupons.
- [ ] Testes: limite de usos sob concorrência, validade, pedido mínimo, cross-Loja.

## Comments

- 2026-11-04 — Revisado: Better Auth + MillionSend ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)); Cupons promocionais por [62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md). Pode correr em paralelo ao 26/27.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CUP-01 a CUP-05, NAV-01 (rota `/cupons` sob `store.settings`) e T-06/T-08; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §13. Extras do Anota em aberto: P-CUP-1 a P-CUP-5 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md); cupom de frete (P-CUP-2) diverge do critério "não incide sobre a taxa de Delivery" deste ticket e foi recomendado não.
