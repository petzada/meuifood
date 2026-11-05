# 24 — Portar horários, Pausa, Pedido Guest, Delivery e impressão

**What to build:** Horários e Pausa, o Pedido Guest em Retirada e Delivery com a fila do Painel voltam a funcionar como nos Tickets 07–09, agora em D1 — com Loja ativa, Pausa e horário verificados na mesma escrita que cria o Pedido — e o Painel ganha impressão do Pedido em 80 mm.

**Blocked by:** 23 — Portar Cardápio, Complementos e imagens.

**Status:** ready-for-agent

**Agente:** Opus (geral); impressão 80 mm por um subagente Fable em paralelo, depois do contrato do Pedido.

- [ ] Horários (`America/Sao_Paulo`, `HH:MM`, sem overnight — [58](../../../docs/decisoes/58-timezone-horarios-loja-mvp.md)) e Pausa portados com os testes do Ticket 07.
- [ ] Pedido Guest em Retirada e Delivery com snapshots, recálculo no servidor e idempotência (Tickets 08/09); meio `on_delivery` disponível.
- [ ] Loja `active`, Pausa, horário, Retirada ativa e bairro atendido verificados **na mesma escrita** que cria o Pedido (`batch` + `INSERT … SELECT` condicional + constraints) — achado 19.1.
- [ ] Chave de idempotência `UNIQUE`: retry não duplica Pedido.
- [ ] Fila do Painel por polling de 10 s com som único por Pedido novo; transições válidas por Fulfillment; conclusão manual.
- [ ] Taxa por bairro ou Taxa fixa, um modo por Loja, recalculada no servidor.
- [ ] Página do Pedido por token de acesso, sem vazar outra Loja; `wa.me` da Loja.
- [ ] Botão imprimir no detalhe do Pedido: layout de cupom 80 mm (itens, escolhas, observações, Fulfillment, endereço, pagamento, total) via `window.print` com CSS de impressão.
- [ ] Testes: Pausa ativada entre carrinho e envio rejeita; Loja não ativa rejeita; vazamento entre Lojas em Pedidos e Delivery.

## Comments

- 2026-11-04 — Porta 07, 08 e 09; impressão por [62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md). Se `batch` não bastar para contenção, avaliar Durable Object por Loja e registrar decisão.
