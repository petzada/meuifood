# 09 — Adicionar Delivery por Taxa fixa ou bairro

**What to build:** O Dono configura exatamente um modo de taxa de Delivery e o Consumidor conclui Delivery com endereço e valor calculados no servidor, podendo escolher Retirada quando disponível.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada.

**Status:** ready-for-agent

- [ ] Dono escolhe Taxa fixa ou taxa por bairro, nunca os dois modos ativos simultaneamente.
- [ ] No modo por bairro, Dono mantém bairros e preços em centavos sem duplicatas ambíguas.
- [ ] No modo Taxa fixa, um único valor válido é aplicado e dados inativos do modo anterior não afetam o Pedido.
- [ ] Dono ativa ou desativa Retirada independentemente do modo de Delivery.
- [ ] Delivery exige endereço e valida bairro atendido quando aplicável.
- [ ] A API calcula a taxa e o total; valores enviados pelo navegador não são fonte de verdade.
- [ ] Bairro não atendido bloqueia Delivery e não impede Retirada quando ativa.
- [ ] Operador não altera configurações e não entram km, raio ou geocoding.

