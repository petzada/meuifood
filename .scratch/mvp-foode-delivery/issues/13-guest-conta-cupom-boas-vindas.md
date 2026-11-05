# 13 — Converter Guest em conta e aplicar Cupom de boas-vindas

**What to build:** O Guest cria conta por magic link (Better Auth + MillionSend) após o Pedido, comprova o vínculo e recupera Pedidos elegíveis da mesma Loja; o Dono configura um Cupom de boas-vindas opt-in que pode ser emitido e aplicado com segurança.

**Blocked by:** 24 — Portar horários, Pausa, Pedido Guest e Delivery para a stack nova.

**Status:** ready-for-agent

- [ ] Conta de Consumidor usa magic link do Better Auth enviado pela MillionSend e permanece separada da identidade de membro da Loja.
- [ ] O fluxo coleta e-mail, confirma o telefone e vincula o `order_id` sem recriar ou apagar o Pedido.
- [ ] Apenas Pedidos elegíveis da mesma Loja e telefone normalizado podem ser recuperados.
- [ ] Novo Pedido autenticado já nasce ligado à conta correta sem impedir Guest checkout.
- [ ] Dono liga/desliga o programa e configura desconto em R$ ou %, com limites válidos.
- [ ] Operador não vê nem altera o Cupom de boas-vindas.
- [ ] O incentivo é emitido somente quando o programa está ativo e aplicado uma única vez conforme sua regra.
- [ ] A API recalcula o desconto e rejeita adulteração do navegador.
- [ ] Magic link com rate limit e Turnstile.
- [ ] Fidelidade por quantidade de Pedidos, item grátis, pontos e cashback não entram.

## Comments

- 2026-11-04 — Revisado no pivô ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)): Supabase magic link → Better Auth + MillionSend; bloqueio passa do 08 para o 24. Independe dos tickets de pagamento e pode correr em paralelo a 26/27.
