# 12 — Cancelar Pedido e executar Estorno automático

**What to build:** Dono ou Operador cancela um Pedido uma única vez e a API produz a consequência financeira correta: Estorno total automático para PIX/Crédito pago no provedor que cobrou (Efí ou AbacatePay), cancelamento/expiração de cobrança pendente ou somente mudança do Pedido em Pagamento na entrega.

**Blocked by:** 27 — Pagar por Crédito à vista com Efí (Normal) ou AbacatePay (Rápido).

**Status:** ready-for-agent

- [ ] Dono e Operador usam o mesmo contrato de cancelamento para um Pedido elegível da própria Loja.
- [ ] Não existe comando independente de Estorno sem cancelamento.
- [ ] Cancelamento persiste o Pedido e a obrigação de Estorno antes de depender do resultado externo.
- [ ] PIX pago usa a devolução da API Pix Efí; Crédito pago usa o estorno do provedor gravado na cobrança (Efí ou AbacatePay); chave idempotente estável e Estorno total.
- [ ] Cobrança pendente é cancelada/expirada quando suportado; pagamento tardio converge para Estorno total.
- [ ] `on_delivery` altera somente o Pedido, sem provider, Estorno ou Ledger de gateway.
- [ ] Pedido Cancelado e estado do Estorno permanecem observáveis separadamente no Painel (em andamento, concluído, falhou).
- [ ] Falha do provider não reabre o Pedido e fica retentável e observável (Sentry sem dados sensíveis).
- [ ] Ledger preserva obrigação e fatos do Estorno sem apagar o histórico; repasse ainda não pago é anulado, repasse já pago vira valor a recuperar.
- [ ] Testes com adapters controlados dos dois provedores, contra D1 efêmero.

## Comments

- 2026-11-04 — Revisado no pivô ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)): providers Woovi/Asaas → Efí/AbacatePay; bloqueio passa do 11 para o 27.
