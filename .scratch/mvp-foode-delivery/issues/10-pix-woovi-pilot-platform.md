# 10 — Pagar por PIX Woovi em `pilot_platform`

**What to build:** O Consumidor paga um Pedido do Comerciante-modelo por PIX, recebe QR Code/copia-e-cola seguros e a confirmação Woovi converge por webhook para o Pedido e para uma única obrigação no Ledger de repasse.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada.

**Status:** ready-for-agent

- [ ] A API resolve o Modo de cobrança protegido e permite somente o Comerciante-modelo em `pilot_platform`.
- [ ] O SDK oficial Woovi cria uma cobrança por intenção idempotente sem expor secrets.
- [ ] A resposta pública contém apenas os dados necessários ao pagamento e acompanhamento.
- [ ] O webhook Woovi verifica autenticidade e aceita duplicata, reentrega e evento fora de ordem sem duplicar ou regredir efeitos.
- [ ] Pagamento confirmado atualiza o estado canônico do Pedido e cria um único lançamento no Ledger.
- [ ] O Ledger registra Pedido, cobrança, provider, total, taxa comercial de 1,19%, líquido, previsão D+1 e data paga ainda ausente.
- [ ] Ops pode marcar o repasse efetivamente pago sem transformar o Ledger em extrato bancário; Dono e Operador não executam essa ação.
- [ ] `on_delivery` continua sem cobrança/Ledger e `baas`/`merchant_own_account` não ganham execução ou UI.
- [ ] Testes usam API/webhook reais, Postgres/RLS e adapter Woovi controlado.

