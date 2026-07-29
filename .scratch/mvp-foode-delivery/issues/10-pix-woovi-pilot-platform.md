# 10 — Pagar por PIX Woovi em `pilot_platform`

**What to build:** O Consumidor paga um Pedido do Comerciante-modelo por PIX, recebe QR Code/copia-e-cola seguros e a confirmação Woovi converge por webhook para o Pedido e para uma única obrigação no Ledger de repasse.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada.

**Status:** needs-review

- [x] A API resolve o Modo de cobrança protegido e permite somente o Comerciante-modelo em `pilot_platform`.
- [x] O SDK oficial Woovi cria uma cobrança por intenção idempotente sem expor secrets.
- [x] A resposta pública contém apenas os dados necessários ao pagamento e acompanhamento.
- [x] O webhook Woovi verifica autenticidade e aceita duplicata, reentrega e evento fora de ordem sem duplicar ou regredir efeitos.
- [x] Pagamento confirmado atualiza o estado canônico do Pedido e cria um único lançamento no Ledger.
- [x] O Ledger registra Pedido, cobrança, provider, total, taxa comercial de 1,19%, líquido, previsão D+1 e data paga ainda ausente.
- [x] Ops pode marcar o repasse efetivamente pago sem transformar o Ledger em extrato bancário; Dono e Operador não executam essa ação.
- [x] `on_delivery` continua sem cobrança/Ledger e `baas`/`merchant_own_account` não ganham execução ou UI.
- [ ] Testes usam API/webhook reais, Postgres/RLS e adapter Woovi controlado.

## Comments

### 2026-07-29 — implementação

- SDK: `@woovi/node-sdk@1.3.3` (versão oficial atual no npm).
- Webhook: `x-webhook-signature` via `woovi.webhook.handler` (contrato oficial).
- Ops auth (decisão mínima de implementação, Decisão 25 / spec §219): `FOODE_OPS_API_TOKEN` + `Authorization: Bearer` em `POST /ops/ledger-entries/:id/mark-paid`. Não é papel de Loja nem quarto app.
- D+1: dia civil `America/Sao_Paulo` + 1; preferência a settlement do provider se presente.
- Arredondamento: half-up inteiro `(gross * 119 + 5000) / 10000` — contrato nos testes Seam 3.
- Seam 3 verde localmente (money/ledger/parsers). Seam 1+2 cobertos em `payment-routes.test.ts`; checkbox de testes de integração remota fica pendente da evidência CI (Supabase real).
