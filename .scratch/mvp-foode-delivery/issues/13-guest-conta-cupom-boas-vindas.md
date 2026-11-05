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

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) U1–U4 (Cupom inline no checkout, um erro específico por código, desconto fora da taxa de entrega) e §6 criar conta. Não adotar o lookup por telefone do print 17 (P-2.1; diverge da decisão 43). Pendentes: P-3.4 e P-7.1 em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-3.4 (endereços salvos na conta), P-CUP-1 (teto %), P-CUP-3 (dias da semana), P-CUP-5 (modelos), P-7.1 (sem vitrine); apoio ao P-2.1. Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): mantém magic link, vínculo e Cupom de boas-vindas; corta vários endereços salvos; Cupom mantém dias da semana.

- 2026-11-05 — Decisão [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md): login do Consumidor por código de 4 dígitos no WhatsApp (whatsmiau.dev), sem magic link; conta única Foode com CPF obrigatório e único; vínculo de Pedidos pelo telefone verificado na mesma Loja. Instância e secrets da whatsmiau ficam para o fim da implementação (erro controlado até lá).
