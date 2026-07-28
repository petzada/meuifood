# 11 — Pagar por Crédito Asaas em `pilot_platform`

**What to build:** O Consumidor paga por Crédito online à vista e o Asaas produz estados seguros de aprovação, pendência ou falha, confirmação idempotente por webhook e obrigação auditável no mesmo Ledger do piloto.

**Blocked by:** 10 — Pagar por PIX Woovi em `pilot_platform`.

**Status:** ready-for-agent

- [ ] O provider Asaas reutiliza o contrato financeiro existente por `fetch` e validação Zod, sem SDK comunitário.
- [ ] Uma intenção idempotente cria no máximo uma cobrança lógica e externa.
- [ ] Aprovação, pendência e rejeição são distinguíveis, e somente confirmação canônica marca o pagamento como pago.
- [ ] Dados de cartão não são persistidos, logados, enviados ao Sentry ou devolvidos depois da intenção.
- [ ] O webhook Asaas é autenticado, validado e suporta entrega `at-least-once` e fora de ordem.
- [ ] Pagamento confirmado cria uma obrigação com 3,29% mais R$ 0,79, líquido em centavos e previsão D+33.
- [ ] O Ledger preserva previsão, pagamento efetivo e histórico no mesmo modelo inaugurado pelo PIX.
- [ ] O contrato aceita somente Crédito à vista; parcelamento, Débito e Voucher ficam fora.
- [ ] O happy path continua limitado ao Comerciante-modelo em `pilot_platform`.

