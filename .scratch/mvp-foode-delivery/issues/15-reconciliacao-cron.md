# 15 — Reconciliar pagamentos e repasses por Cron Triggers

**What to build:** Um Cron Trigger do Worker `api` consulta cobranças, Estornos e lançamentos pendentes na AbacatePay e na Efí, reaplica transições idempotentes e alerta divergências.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

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
