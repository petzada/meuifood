# 12 — Cancelar Pedido e executar Estorno automático

**What to build:** Dono ou Operador cancela um Pedido uma única vez e a API produz a consequência financeira correta: Estorno total automático para PIX/Cartão pago no provedor que cobrou (AbacatePay ou Efí), cancelamento/expiração de cobrança pendente ou somente mudança do Pedido em Pagamento na entrega.

**Blocked by:** 27 — Pagar por Cartão à vista: Normal (Efí) ou Rápido (AbacatePay).

**Agente:** Opus (geral); feedback de Estorno no Painel por Fable, se necessário.

**Status:** ready-for-agent

- [ ] Dono e Operador usam o mesmo contrato de cancelamento para um Pedido elegível da própria Loja.
- [ ] Não existe comando independente de Estorno sem cancelamento.
- [ ] Cancelamento persiste o Pedido e a obrigação de Estorno antes de depender do resultado externo.
- [ ] PIX e Cartão Rápido pagos usam o estorno da AbacatePay; Cartão Normal usa o estorno da Efí; provedor lido da cobrança gravada; chave idempotente estável e Estorno total.
- [ ] Cobrança pendente é cancelada/expirada quando suportado; pagamento tardio converge para Estorno total.
- [ ] `on_delivery` altera somente o Pedido, sem provider, Estorno ou Ledger de gateway.
- [ ] Motivo do cancelamento opcional, escolhido de uma lista curta fixa (ex.: "Item em falta", "Loja sem entregador", "Consumidor pediu", "Outro"), gravado no Pedido e visível no detalhe; cancelar sem motivo continua possível (P-OPE-3).
- [ ] Cancelar fica só no detalhe do Pedido (nunca X no card) e abre diálogo de confirmação com a consequência financeira escrita: `on_delivery` "O Pedido será cancelado."; pago "R$ X serão estornados automaticamente ao Consumidor."; pendente "A cobrança será cancelada." (CAN-01, T-12, PED-07).
- [ ] Pedido Cancelado e estado do Estorno permanecem observáveis separadamente no Painel, com selo próprio (Estorno em andamento / concluído / falhou — nova tentativa automática) no card de Cancelados e no detalhe; o Pedido nunca reabre (CAN-02).
- [ ] Falha do provider não reabre o Pedido e fica retentável e observável (Sentry sem dados sensíveis).
- [ ] Ledger preserva os fatos do Estorno sem apagar histórico: lançamento ainda não repassado é anulado; já repassado vira débito compensado nos lotes seguintes da Loja.
- [ ] Testes com adapters controlados dos dois provedores, com D1 via `@cloudflare/vitest-plugin` no CI.
- [ ] UI segue as [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) aplicáveis (CAN-01, CAN-02, T-03, T-12, PED-07) e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, regra separada da apresentação, matriz de papéis em module, testes que afirmam comportamento e não substrings de HTML).
- [ ] Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md): Estorno total devolve também a tarifa de serviço.

## Comments

- 2026-11-04 — Revisado no pivô ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)): providers Woovi/Asaas → AbacatePay/Efí; bloqueio passa do 11 para o 27.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CAN-01 (confirmação com a consequência financeira escrita), CAN-02 (selo de Estorno separado do Pedido), T-12 e PED-07 (Cancelar no detalhe, nunca X no card). Motivo do cancelamento em aberto: P-OPE-3 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-OPE-3 (motivo opcional de cancelamento). Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Critérios consolidados com 63–65: P-OPE-3, CAN-01/CAN-02 e o critério de UI/`/code-review` do antigo Ticket 20 entraram no checklist; seam de testes renomeado para `@cloudflare/vitest-plugin`. O detalhe e a fila do Painel nascem no [24b](24b-painel-operacao-pedido.md).

- 2026-11-05 — Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md) aplicada.
