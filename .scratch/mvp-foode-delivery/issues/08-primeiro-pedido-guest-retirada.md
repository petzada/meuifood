# 08 — Concluir o primeiro Pedido Guest na Retirada

**What to build:** Um Guest monta o carrinho, escolhe Retirada e Pagamento na entrega, conclui um Pedido com total recalculado pela API e o acompanha enquanto Dono ou Operador trabalha a fila do Painel com polling e som.

**Blocked by:** 06 — Configurar Complementos e montar o carrinho; 07 — Aplicar horários e Pausa no Canal próprio.

**Status:** ready-for-agent

- [ ] Guest informa nome e telefone, não precisa de e-mail ou conta e não informa endereço para Retirada.
- [ ] A Loja precisa ter Retirada ativa e estar aberta e sem Pausa no momento da criação.
- [ ] A API recalcula itens, escolhas e total em centavos e rejeita preço ou disponibilidade adulterados.
- [ ] `on_delivery` cria Pedido sem provider, cobrança, taxa online ou Ledger.
- [ ] Retry da mesma intenção não cria Pedido duplicado.
- [ ] Dono e Operador veem o Pedido, seus snapshots e somente as transições válidas de Retirada.
- [ ] A fila consulta HTTP no carregamento e a cada 10 segundos e toca som uma única vez por Pedido realmente novo.
- [ ] O Consumidor acompanha o status no Canal próprio e pode abrir `wa.me` sem bot ou envio automático.
- [ ] Pedido de outra Loja permanece inacessível no Storefront e no Painel.

