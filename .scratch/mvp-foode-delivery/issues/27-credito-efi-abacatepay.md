# 27 — Pagar por Crédito à vista com Efí (Normal) ou AbacatePay (Rápido)

**What to build:** O Consumidor paga por Crédito à vista num formulário da própria Loja; a cobrança vai para o Provedor do cartão definido por Ops para a Loja — Efí ou AbacatePay — e converge por webhook para o Pedido e para obrigações no mesmo Ledger do PIX.

**Blocked by:** 26 — Pagar por PIX Efí em `pilot_platform`.

**Status:** ready-for-agent

- [ ] Loja tem Provedor do cartão `efi` ou `abacatepay`, protegido e alterável só por Ops; o Storefront nunca vê nem escolhe o provedor.
- [ ] Checkout transparente no visual Foode: tokenização no navegador (`payment-token-efi` com o identificador de conta Efí, ou `ctok_` da AbacatePay); número, CVV e validade nunca passam pela `api`, logs ou Sentry.
- [ ] Ao escolher Cartão, o Guest informa CPF e e-mail (e data de nascimento quando o provedor for Efí); PIX e `on_delivery` continuam sem esses campos. Validação no servidor.
- [ ] Somente à vista; não existe seletor de parcelas.
- [ ] Intenção idempotente cria no máximo uma cobrança lógica e externa; aprovado, pendente e recusado são distinguíveis e só a confirmação canônica marca pago.
- [ ] Efí cobrança: `notification_url` por cobrança com segredo; estado obtido por `GET /v1/notification/:token`.
- [ ] AbacatePay: webhook autenticado conforme a doc vigente; entrega `at-least-once` e fora de ordem.
- [ ] Cada cobrança grava provedor, taxa e prazo efetivos; retenção do provedor (ex.: parte liberada depois) vira parcelas previstas no Ledger.
- [ ] Provedor indisponível deixa o Crédito indisponível na Loja, com mensagem clara; sem troca automática.
- [ ] Testes com adapters controlados dos dois provedores, contra D1 efêmero.

## Comments

- 2026-11-04 — Substitui o Ticket 11 ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)). Referência: `lib/providers/efi/card.ts`, `lib/providers/abacatepay/*` e `lib/payments/efi-card-form.ts` do ceremony (sem o roteamento por plano nem o kill switch).
