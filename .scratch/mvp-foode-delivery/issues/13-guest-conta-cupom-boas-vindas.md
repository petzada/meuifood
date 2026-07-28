# 13 — Converter Guest em conta e aplicar Cupom de boas-vindas

**What to build:** O Guest cria conta por magic link após o Pedido, comprova o vínculo e recupera Pedidos elegíveis da mesma Loja; o Dono configura um Cupom de boas-vindas opt-in que pode ser emitido e aplicado com segurança.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada.

**Status:** ready-for-agent

- [ ] Conta de Consumidor usa magic link por e-mail e permanece separada da identidade de membro da Loja.
- [ ] O fluxo coleta e-mail, confirma o telefone e vincula o `order_id` sem recriar ou apagar o Pedido.
- [ ] Apenas Pedidos elegíveis da mesma Loja e telefone normalizado podem ser recuperados.
- [ ] Novo Pedido autenticado já nasce ligado à conta correta sem impedir Guest checkout.
- [ ] Dono liga/desliga o programa e configura desconto em R$ ou %, com limites válidos.
- [ ] Operador não vê nem altera o Cupom de boas-vindas.
- [ ] O incentivo é emitido somente quando o programa está ativo e aplicado uma única vez conforme sua regra.
- [ ] A API recalcula o desconto e rejeita adulteração do navegador.
- [ ] Fidelidade por quantidade de Pedidos, item grátis, pontos e cashback não entram.

