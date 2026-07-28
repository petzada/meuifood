# 12 — Cancelar Pedido e executar Estorno automático

**What to build:** Dono ou Operador cancela um Pedido uma única vez e a API produz a consequência financeira correta: Estorno total automático para PIX/Crédito pago, cancelamento/expiração de cobrança pendente ou somente mudança do Pedido em Pagamento na entrega.

**Blocked by:** 11 — Pagar por Crédito Asaas em `pilot_platform`.

**Status:** ready-for-agent

- [ ] Dono e Operador usam o mesmo contrato de cancelamento para um Pedido elegível da própria Loja.
- [ ] Não existe comando independente de Estorno sem cancelamento.
- [ ] Cancelamento persiste o Pedido e a obrigação de Estorno antes de depender do resultado externo.
- [ ] PIX pago usa Woovi e Crédito pago usa Asaas com chave idempotente estável e Estorno total.
- [ ] Cobrança pendente é cancelada/expirada quando suportado; pagamento tardio converge para Estorno total.
- [ ] `on_delivery` altera somente o Pedido, sem provider, Estorno ou Ledger de gateway.
- [ ] Pedido Cancelado e estado do Estorno permanecem observáveis separadamente.
- [ ] Falha do provider não reabre o Pedido e fica retentável e observável.
- [ ] Ledger preserva obrigação e fatos do Estorno sem apagar o histórico.

