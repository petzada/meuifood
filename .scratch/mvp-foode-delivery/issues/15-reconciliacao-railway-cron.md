# 15 — Reconciliar pagamentos e repasses por Cron Triggers

**What to build:** Um Cron Trigger do Worker `api` consulta cobranças, Estornos e obrigações pendentes na Efí e na AbacatePay, reaplica transições idempotentes e alerta divergências.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

- [ ] O handler `scheduled` da `api` roda pelo Cron Trigger e reporta resultado observável (Workers Logs + Sentry).
- [ ] Não cria quarto app, worker sempre-on, fila externa ou Redis.
- [ ] Efí (Pix e cobrança) e AbacatePay são consultados pelos mesmos adapters e fatos usados pelos webhooks.
- [ ] Execução repetida, concorrente ou sobre evento já processado produz um único efeito lógico e nenhuma regressão.
- [ ] Evento perdido converge cobrança e Ledger; pagamento tardio de Pedido Cancelado converge para Estorno total.
- [ ] Estorno pendente ou falho permanece retentável no provider correto.
- [ ] A reconciliação detecta obrigação de repasse divergente sem promover previsão a pagamento efetivo.
- [ ] Falha parcial não esconde as demais unidades processadas e não vaza secrets.
- [ ] Testes invocam o handler real contra D1 efêmero com adapters controlados; agendador e rede externa ficam fora da suíte.

## Comments

- 2026-11-04 — Revisado no pivô ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md), [60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md)): Railway Cron → Cron Triggers; Woovi/Asaas → Efí/AbacatePay. O nome do arquivo foi mantido para não quebrar links.
