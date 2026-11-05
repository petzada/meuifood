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
- [ ] Pedido Cancelado e estado do Estorno permanecem observáveis separadamente no Painel (em andamento, concluído, falhou).
- [ ] Falha do provider não reabre o Pedido e fica retentável e observável (Sentry sem dados sensíveis).
- [ ] Ledger preserva os fatos do Estorno sem apagar histórico: lançamento ainda não repassado é anulado; já repassado vira débito compensado nos lotes seguintes da Loja.
- [ ] Testes com adapters controlados dos dois provedores, com D1 do pool-workers no CI.

## Comments

- 2026-11-04 — Revisado no pivô ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)): providers Woovi/Asaas → AbacatePay/Efí; bloqueio passa do 11 para o 27.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CAN-01 (confirmação com a consequência financeira escrita), CAN-02 (selo de Estorno separado do Pedido), T-12 e PED-07 (Cancelar no detalhe, nunca X no card). Motivo do cancelamento em aberto: P-OPE-3 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).
