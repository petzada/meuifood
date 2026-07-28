# 15 — Reconciliar pagamentos e repasses por Railway Cron

**What to build:** Uma execução short-lived da responsabilidade da API consulta cobranças, Estornos e obrigações pendentes, reaplica transições idempotentes e alerta divergências antes de encerrar.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

- [ ] A entrada é executável pelo Railway Cron e termina com código de saída significativo.
- [ ] Não cria quarto app, worker sempre-on, `node-cron`, fila externa ou Redis.
- [ ] Woovi e Asaas são consultados pelos mesmos adapters e fatos usados pelos webhooks.
- [ ] Execução repetida, concorrente ou sobre evento já processado produz um único efeito lógico e nenhuma regressão.
- [ ] Evento perdido converge cobrança e Ledger; pagamento tardio de Pedido Cancelado converge para Estorno total.
- [ ] Estorno pendente ou falho permanece retentável no provider correto.
- [ ] A reconciliação detecta obrigação de repasse divergente sem promover previsão a pagamento efetivo.
- [ ] Falha parcial não esconde as demais unidades processadas e chega a stdout/Sentry sem secrets.
- [ ] Testes invocam a entrada real com Postgres e adapters controlados; rede externa e agendador Railway ficam fora da suíte.

