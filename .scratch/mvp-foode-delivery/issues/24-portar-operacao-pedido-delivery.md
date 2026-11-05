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
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) PED-01 a PED-09, IMP-01/IMP-02, NAV-04/NAV-07, CFG-01 a CFG-03 e NAV-05 (subrotas de `/configuracoes`); mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §4 a §6 e §8. Em aberto: P-OPE-1/2/5, P-IMP-1/2, P-PDV-1, P-WPP-1 e P-CFG-1/2/3/5 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md). P-OPE-4 (Operador ativar a Pausa) diverge da decisão 41 e da 38 e está sinalizado ao Dono; até resposta, vale a decisão (só o Dono).

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) G1–G10, C1/C6, K7, X1–X4, X6–X9 e o bloco "Pagar na entrega" de X5. Pendentes em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md): P-2.2–P-2.5, P-3.3, P-4.1, P-4.2, P-5.1, P-6.1; se aprovadas, observações, subtipo na entrega e troco entram no detalhe do Pedido e no cupom 80 mm.

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-2.1 (busca por telefone com salvaguardas), P-2.2, P-2.3, P-2.4, P-2.5, P-3.1 (CEP), P-3.3, P-4.2 (troco), P-4.3 (bandeiras débito/crédito), P-5.1, P-6.1, P-6.2, P-OPE-2, P-OPE-4 (Operador pausa e retoma), P-IMP-1 (Imprimir ao aceitar), P-IMP-2, P-WPP-1, P-CFG-5. Vale sobre as perguntas em aberto dos comentários anteriores.
