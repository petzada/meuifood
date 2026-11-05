# 26 — Pagar por PIX Efí em `pilot_platform`

**What to build:** O Consumidor paga um Pedido do Comerciante-modelo por PIX Efí, recebe QR Code e copia-e-cola na página do Pedido, e a confirmação converge por webhook e consulta autenticada para o Pedido e para uma única obrigação no Ledger de repasse.

**Blocked by:** 25 — Colocar a stack Cloudflare em produção e desligar Supabase e Railway.

**Status:** ready-for-agent

- [ ] Cliente Efí Pix na `api` com mTLS pelo binding `mtls_certificates` (certificado `.p12` da conta Efí **exclusiva do Foode**), OAuth por aplicação própria e secrets em `wrangler secret`.
- [ ] Cobrança imediata com `txid` derivado de uma intenção idempotente: retry não cria segunda cobrança.
- [ ] A resposta pública traz só QR, copia-e-cola, valor e expiração.
- [ ] Webhook cadastrado na chave Pix aleatória do Foode, sem mTLS de cliente e com segredo na URL (`?hmac=…&ignorar=`); o corpo só aponta o que mudou e o estado vem da consulta autenticada. Script de registro do webhook versionado.
- [ ] Duplicata, reentrega e evento fora de ordem não duplicam efeito nem regridem estado; URL e corpo nunca vão a log ou Sentry.
- [ ] Pagamento confirmado atualiza o Pedido e cria um único lançamento no Ledger com provider, total, taxa, líquido, previsão e data paga ausente — taxa e prazo lidos da tabela versionada (valores a definir pelo Dono).
- [ ] Ops marca o repasse como pago; Dono e Operador não executam essa ação.
- [ ] `on_delivery` segue sem cobrança nem Ledger.
- [ ] Reaproveitado do PR #19 (sem Woovi): money, Ledger, idempotência de evento, rota de Ops e UI do QR na página do Pedido.
- [ ] Testes: webhook e rota reais contra D1 efêmero, adapter Efí controlado no limite HTTP, parsers com fixtures sanitizadas.

## Comments

- 2026-11-04 — Substitui o Ticket 10 ([60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md), [ADR 0007](../../../docs/adr/0007-efi-abacatepay-provedor-fixo-por-loja.md)). Referência de implementação: `lib/providers/efi/*` e `app/api/webhooks/efi-pix` do ceremony.
