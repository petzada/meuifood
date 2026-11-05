# 26 — Pagar por PIX AbacatePay com Ledger de repasse

**What to build:** O Consumidor paga por PIX AbacatePay e recebe QR Code e copia-e-cola na página do Pedido; a confirmação converge por webhook para o Pedido e para um único lançamento no Ledger, com taxa Foode vigente, liberação imediata e repasse previsto D+1 útil.

**Blocked by:** 25 — Domínios, e-mail e remoção do legado; 29 — Área Ops (taxa vigente).

**Status:** ready-for-agent

**Agente:** Opus (geral); bloco de pagamento PIX no Storefront por Fable, após o contrato da API.

- [ ] Cliente AbacatePay na `api` (`fetch` + Zod), chave da conta única do Foode em `wrangler secret`; credenciais de **produção** (decisão do Dono).
- [ ] Meio `pix` só aparece no checkout com taxa Foode vigente para a Loja ([61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)); se a AbacatePay exigir CPF/e-mail no PIX, o campo aparece só no PIX.
- [ ] Cobrança por intenção idempotente: retry não cria segunda cobrança.
- [ ] Resposta pública só com QR, copia-e-cola, valor e expiração; a página do Pedido acompanha o status.
- [ ] Webhook `api.foodedelivery.com.br/webhooks/abacatepay` registrado por API (ou passo manual informado), autenticado conforme a doc vigente; duplicata, reentrega e fora de ordem sem regressão; corpo e segredo fora de logs/Sentry.
- [ ] Pagamento confirmado: Pedido pago + lançamento único no Ledger (total, taxa Foode, custo do provedor, líquido, liberação no provedor = data do pagamento, repasse previsto = próximo dia útil).
- [ ] Calendário de dias úteis (feriados nacionais) em `@foode/shared`, testado.
- [ ] Reaproveitado do PR #19: money, Ledger, idempotência de eventos, UI do QR — sem Woovi.
- [ ] Testes com adapter AbacatePay fake no limite HTTP; parsers com fixtures sanitizadas.
- [ ] Smoke manual mínimo: o orquestrador pede ao humano um PIX real de valor baixo numa Loja de teste e confere Pedido + Ledger.

## Comments

- 2026-11-04 — Substitui o Ticket 10. PIX passou da Efí para a AbacatePay ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)); sem mTLS. Referência: `lib/providers/abacatepay/*` do ceremony.
