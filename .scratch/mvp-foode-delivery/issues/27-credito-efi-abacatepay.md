# 27 — Pagar por Cartão à vista: Normal (Efí) ou Rápido (AbacatePay)

**What to build:** O Consumidor paga com Cartão de crédito à vista num formulário da própria Loja; a cobrança vai para o provedor do modo contratado pela Loja e converge para o Pedido e para o Ledger com taxa, liberação e repasse previsto corretos.

**Blocked by:** 26 — Pagar por PIX AbacatePay.

**Status:** ready-for-agent

**Agente:** Opus para providers/webhooks; Fable para o formulário de cartão, após o contrato.

- [ ] Modo da Loja (Normal/Rápido, definido no `/ops`) escolhe o provedor; o Storefront não vê nem escolhe.
- [ ] Efí Normal: API de Cobranças (one-step com `payment_token` gerado no navegador pela lib `payment-token-efi` e o identificador de conta), credenciais de aplicação da conta Efí do Foode em `wrangler secret`; `notification_url` por cobrança com `?secret=`; estado por `GET /v1/notification/:token`.
- [ ] AbacatePay Rápido: cartão transparente com `ctok_` gerado no navegador; webhook autenticado.
- [ ] Formulário Foode (outline, Nunito, mobile-first); número/CVV/validade nunca chegam à `api`, logs ou Sentry.
- [ ] Ao escolher Cartão: CPF, e-mail e (Efí) data de nascimento, validados no servidor; PIX e `on_delivery` sem esses campos.
- [ ] Só à vista; meio indisponível sem taxa Foode vigente para o modo da Loja.
- [ ] Intenção idempotente; aprovado, pendente e recusado distinguíveis; só a confirmação canônica marca pago.
- [ ] Ledger: taxa Foode, custo do provedor, liberação prevista (Efí: até 21 dias úteis ou data informada; AbacatePay: até 1 dia útil ou informada), retenção como parcela separada, repasse previsto = dia útil seguinte à liberação.
- [ ] **Avaliar débito online e carteiras** nas docs vigentes da Efí e da AbacatePay; se houver suporte no checkout transparente, abrir ticket próprio e informar o orquestrador; se não, registrar a conclusão aqui.
- [ ] Testes com adapters fakes dos dois provedores; credenciais de produção só no smoke manual (cartão real, valor baixo, seguido de cancelamento no Ticket 12).

## Comments

- 2026-11-04 — Substitui o Ticket 11 ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md), [61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)). Referência: `lib/providers/efi/card.ts`, `lib/payments/efi-card-form.ts` e `lib/providers/abacatepay/card.ts` do ceremony, sem roteamento por plano nem kill switch.
