# 24 — Portar horários, Pausa, Pedido Guest e Delivery para a stack nova

**What to build:** Horários e Pausa, o Pedido Guest na Retirada com fila do Painel e o Delivery por taxa fixa ou bairro voltam a funcionar como nos Tickets 07–09, agora em D1 — com a Pausa e o horário avaliados na mesma escrita atômica que cria o Pedido.

**Blocked by:** 23 — Portar Cardápio, Complementos e imagens para a stack nova.

**Status:** ready-for-agent

- [ ] Horários (`America/Sao_Paulo`, `HH:MM`, sem overnight — [58](../../../docs/decisoes/58-timezone-horarios-loja-mvp.md)) e Pausa portados com os testes do Ticket 07.
- [ ] Pedido Guest na Retirada e no Delivery portado com snapshots, recálculo no servidor e idempotência da intenção (Tickets 08/09).
- [ ] Pausa, horário, Retirada ativa e bairro atendido são verificados **na mesma escrita** que cria o Pedido (`batch` atômico com `INSERT … SELECT` condicional e constraints); não existe janela entre checar e gravar (achado 19.1).
- [ ] Retry da mesma intenção não cria Pedido duplicado (constraint `UNIQUE` na chave de idempotência).
- [ ] Fila do Painel por polling de 10 s com som único por Pedido novo; transições válidas por Fulfillment.
- [ ] Taxa por bairro ou Taxa fixa, um modo por Loja, recalculada no servidor.
- [ ] Página do Pedido por token de acesso, sem vazar dados de outra Loja.
- [ ] Testes de concorrência provam que Pausa ativada entre o carrinho e o envio rejeita o Pedido.
- [ ] Testes de vazamento cobrem Pedidos e configuração de Delivery.

## Comments

- 2026-11-04 — Aberto no pivô. Porta 07, 08 e 09. Se `batch` não bastar para a contenção, avaliar Durable Object por Loja e registrar a decisão.
