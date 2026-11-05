# 27 — Pagar por Cartão à vista: Normal (Efí) ou Rápido (AbacatePay)

**What to build:** O Consumidor paga com Cartão de crédito à vista num formulário da própria Loja; a cobrança vai para o provedor do modo contratado pela Loja e converge para o Pedido e para o Ledger com taxa, liberação e repasse previsto corretos.

**Blocked by:** 26 — Pagar por PIX AbacatePay.

**Status:** ready-for-agent

**Agente:** Opus para providers/webhooks; Fable para o formulário de cartão, após o contrato.

- [ ] Modo da Loja (Normal/Rápido, definido no `/ops`) escolhe o provedor; o Storefront não vê nem escolhe.
- [ ] Efí Normal: API de Cobranças (one-step com `payment_token` gerado no navegador pela lib `payment-token-efi` e o identificador de conta), credenciais de aplicação da conta Efí do Foode em `wrangler secret`; `notification_url` por cobrança com `?secret=`; estado por `GET /v1/notification/:token`.
- [ ] AbacatePay Rápido: cartão transparente com `ctok_` gerado no navegador; webhook autenticado.
- [ ] Formulário Foode (outline, Nunito, mobile-first); número/CVV/validade nunca chegam à `api`, logs ou Sentry.
- [ ] Ao escolher Cartão: CPF, e-mail e (Efí) data de nascimento, validados no servidor; PIX e `on_delivery` sem esses campos. Consumidor com conta (Ticket 13) tem o CPF da conta pré-preenchido; o e-mail continua pedido no Cartão.
- [ ] Só à vista; meio indisponível sem taxa Foode vigente para o modo da Loja.
- [ ] Intenção idempotente; aprovado, pendente e recusado distinguíveis; só a confirmação canônica marca pago.
- [ ] Ledger: taxa Foode, custo do provedor, liberação prevista (Efí: até 21 dias úteis ou data informada; AbacatePay: até 1 dia útil ou informada), retenção como parcela separada, repasse previsto = dia útil seguinte à liberação.
- [ ] **Avaliar débito online** nas docs vigentes da Efí e da AbacatePay; se houver suporte no checkout transparente, abrir ticket próprio e informar o orquestrador; se não, registrar a conclusão aqui. **Carteiras digitais não entram** (P-4.5: provedores não oferecem).
- [ ] Estados aprovado / pendente / recusado distintos na página do Pedido, com ação clara no recusado ("Tentar outro cartão" ou "Pagar com PIX") (DIRETRIZES-UX-CLIENTE §6).
- [ ] Testes com adapters fakes dos dois provedores, rotas e webhooks com D1 via `@cloudflare/vitest-plugin` só no CI; credenciais de produção só no smoke manual (cartão real, valor baixo, seguido de cancelamento no Ticket 12).
- [ ] UI segue as [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) aplicáveis (X5, G2–G6, §6 Cartão) e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, regra separada da apresentação, testes que afirmam comportamento).
- [ ] Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md): tarifa de serviço R$ 1,50 também no Cartão; Consumidor só à vista.

## Comments

- 2026-11-04 — Substitui o Ticket 11 ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md), [61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)). Referência: `lib/providers/efi/card.ts`, `lib/payments/efi-card-form.ts` e `lib/providers/abacatepay/card.ts` do ceremony, sem roteamento por plano nem kill switch.
- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) X5 (Cartão inline com CPF/e-mail só nesse meio), G2–G6 e §6 Cartão (aprovado/pendente/recusado com ação). Carteiras do print 26 seguem a avaliação deste ticket (P-4.5 em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md)).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-4.5 (sem carteiras). Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Critérios consolidados com 63–65: P-4.5 (sem carteiras) fecha a avaliação de carteiras; débito online segue em avaliação; CPF da conta (65) pré-preenche o Cartão; estados do Cartão na página do Pedido; seam de testes `@cloudflare/vitest-plugin`; critério de UI/`/code-review` do antigo Ticket 20.

- 2026-11-05 — Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md) aplicada.
