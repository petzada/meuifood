# 15 — Reconciliar pagamentos e repasses por Cron Triggers

**What to build:** Um Cron Trigger do Worker `api` consulta cobranças, Estornos e lançamentos pendentes na AbacatePay e na Efí, reaplica transições idempotentes e alerta divergências.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** done

**Agente:** Opus (geral).

- [ ] O handler `scheduled` da `api` roda pelo Cron Trigger e reporta resultado observável (Workers Logs + Sentry).
- [ ] Não cria quarto app, worker sempre-on, fila externa ou Redis.
- [ ] AbacatePay (PIX e cartão) e Efí (cartão) são consultados pelos mesmos adapters e fatos usados pelos webhooks; liberações confirmadas atualizam a data de repasse prevista.
- [ ] Execução repetida, concorrente ou sobre evento já processado produz um único efeito lógico e nenhuma regressão.
- [ ] Evento perdido converge cobrança e Ledger; pagamento tardio de Pedido Cancelado converge para Estorno total.
- [ ] Estorno pendente ou falho permanece retentável no provider correto.
- [ ] A reconciliação detecta obrigação de repasse divergente sem promover previsão a pagamento efetivo.
- [ ] Falha parcial não esconde as demais unidades processadas e não vaza secrets nem dados pessoais (telefone, CPF, e-mail) em logs ou Sentry.
- [ ] Testes invocam o handler real com D1 via `@cloudflare/vitest-plugin` no CI e adapters controlados; agendador e rede externa ficam fora da suíte.

## Comments

- 2026-11-04 — Revisado no pivô ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md), [60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)): Railway Cron → Cron Triggers; Woovi/Asaas → Efí/AbacatePay. O nome do arquivo foi mantido para não quebrar links.

- 2026-11-05 — Critérios consolidados com 63–65: nenhum código P-* novo para este ticket; arquivo renomeado de `15-reconciliacao-railway-cron.md` para `15-reconciliacao-cron.md` (links atualizados) e seam de testes renomeado para `@cloudflare/vitest-plugin`.

- 2026-11-05 — Implementado (branch `feat/15-api-391f`): handler `scheduled` da `api` (`src/reconciliation.ts`) com dois Cron Triggers — `*/5 * * * *` (rotina `payments`: PIX sem webhook, aberto e pago tarde em até 48 h; PIX vencido; Cartão sem desfecho; Cartão recusado e abandonado há 2 h → Cancelado `card_abandoned`, libera o Cupom; Estornos pendentes/falhos/sem confirmação) e `0 9 * * *` (06:00 em São Paulo, rotina `settlement`: liberação do Cartão confirmada no provedor move só a data de repasse prevista; divergências da obrigação de repasse viram alerta, sem corrigir dinheiro). Trava leve por rotina no D1 (`maintenance_locks`), resumo por execução nos Workers Logs e no Sentry (Cron Monitor + mensagens de falha parcial/divergência). Migration 0011 (expand): `maintenance_locks`, `ledger_release_confirmations` e `order_cancellations.system_reason` por ADD COLUMN com CHECK. Testes: `reconciliacao.d1.test.ts` invoca o handler real com D1 e provedores fakes.

- 2026-11-05 — Done no PR do Ticket 15 (squash na `master`); migration `0011_reconciliacao_cron` (`maintenance_locks`, `ledger_release_confirmations`, `order_cancellations.system_reason`). Crons no `foode-api`: `*/5 * * * *` (`payments`: PIX sem webhook/vencido, Cartão sem desfecho, Cartão abandonado 2 h → Cancelado `card_abandoned`, Estornos) e `0 9 * * *` (`settlement`: liberação confirmada atualiza só a data prevista; repasse divergente → alerta Sentry `payout_divergence`). Trava por rotina no D1, resumo por execução nos Workers Logs + Cron Monitor do Sentry, sem dado pessoal. Pendências: confirmar em sandbox que Efí `paid`/AbacatePay `PAID` = crédito liberado (`TODO(15)`); cobrança que deu timeout com webhook perdido não é localizável (adapters sem busca por `custom_id`); contagens de divergência varrem tabelas inteiras (limitar por janela com volume).
