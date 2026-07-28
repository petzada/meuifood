# 14 — Expor Plano, relatórios e Ledger ao Dono

**What to build:** O Dono consulta o Plano ativado por ops, indicadores básicos do Canal próprio e o Ledger auditável do piloto, enquanto o Operador permanece sem acesso a configuração e informações financeiras.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

- [ ] Ops registra flag ativa/inativa e ciclo mensal/anual sem criar cobrança de Mensalidade.
- [ ] Dono vê R$ 179/mês ou R$ 1.718,40/ano com 20% OFF e o estado real do Plano.
- [ ] A tela não oferece pagamento, recorrência, meter de GMV, teto, overage ou conexão com gateway.
- [ ] Relatórios mostram Pedidos por status, Fulfillment e meio de pagamento para um período e uma Loja.
- [ ] GMV soma apenas Pedidos Concluídos pagos online, incluindo itens, Adicionais e taxa de Delivery, e exclui cancelados e `on_delivery`.
- [ ] Ledger mostra Pedido, cobrança, provider, total, taxa, líquido, previsão, pagamento efetivo e Estorno sem se apresentar como extrato bancário.
- [ ] Operador não recebe rotas, agregados, totais ou detalhes do Ledger por UI ou chamada direta.
- [ ] O teto de R$ 15 mil permanece somente âncora comercial fora do produto.

