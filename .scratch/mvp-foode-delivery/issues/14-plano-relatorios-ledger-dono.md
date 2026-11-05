# 14 — Plano e faixa no Painel, relatórios, Repasses e lotes diários

**What to build:** O Dono vê Plano, faixa e contagem de Pedidos do mês, relatórios e a tela Repasses (só leitura); o Ops opera os lotes diários de repasse por Loja e acompanha a margem.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

**Agente:** Opus para apuração/lotes; Fable para as telas, após o contrato.

- [ ] Dono vê Plano (mensal/anual), faixa vigente e contagem de Pedidos não cancelados do mês civil; sem cobrança, recorrência ou bloqueio por faixa.
- [ ] Relatórios por período: Pedidos por status, Fulfillment e meio; GMV só como métrica.
- [ ] Tela **Repasses** (Dono, só leitura): lançamentos (Pedido, meio, total, taxa Foode, líquido, repasse previsto, status) e lotes pagos; nunca mostra custo do provedor.
- [ ] `/ops` **A repassar hoje**: por Loja, total dos lançamentos com repasse previsto até hoje, chave Pix e titular, débitos de Estorno compensados; botão marcar lote pago com data, conta de saída (Efí/AbacatePay), identificador/comprovante e custo do envio.
- [ ] Lote pago é imutável; correção por lançamento de ajuste auditado.
- [ ] `/ops` margem por Loja e período: taxa Foode − custo do provedor − custo de envio.
- [ ] Operador não acessa relatórios, Repasses nem agregados.
- [ ] Testes: dias úteis/feriados, Estorno antes e depois do repasse, lote idempotente, RBAC.

## Comments

- 2026-11-04 — Revisado por [60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md) e [61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md): faixas por Pedidos, lote diário D+1 útil.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) REL-01 a REL-04, NAV-01/NAV-02 (rotas `/relatorios`, `/repasses`, `/plano` no grupo Financeiro; sugestão de permissão `store.finance`) e OPS-01/OPS-04 para os lotes; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §1, §7 e §15. Em aberto: P-REL-1 a P-REL-5 e P-PLN-1 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-REL-1 (PDF+XLSX), P-REL-2 (top 10 + dia da semana), P-REL-3 (TOP 10 clientes), P-REL-4 (funil próprio), P-REL-5 (comparativo), P-PLN-1. Vale sobre as perguntas em aberto dos comentários anteriores.
