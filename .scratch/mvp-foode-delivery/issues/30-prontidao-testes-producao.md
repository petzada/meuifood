# 30 — Prontidão para testes em produção

**What to build:** Um smoke E2E automatizado contra produção e um roteiro curto permitem ao Dono testar o Foode de ponta a ponta com uma Loja real criada pelo `/ops`.

**Blocked by:** 20 — Aprofundar contratos e modules do Storefront e do Painel.

**Status:** ready-for-agent

**Agente:** Opus (geral).

- [ ] Playwright (Chromium) no CI após o deploy: Storefront de Loja sintética de smoke, carrinho, checkout `on_delivery`, Pedido na fila do Painel, impressão renderiza, `/ops` acessível só ao Ops; dados de smoke criados e removidos pelo próprio teste.
- [ ] Verificação automatizada de configuração: secrets presentes nos Workers, webhooks registrados, DNS/e-mail verificados, Sentry recebendo eventos, Cron Trigger ativo, D1 com migrations em dia.
- [ ] `docs/runbook-testes-producao.md`: passo a passo para o Dono criar uma Loja no `/ops`, cadastrar taxas, fazer o onboarding como Dono, pedir por PIX, Cartão (Normal e Rápido) e na entrega, cancelar com Estorno, ver Repasses e marcar um lote pago.
- [ ] Lista final de pendências manuais (se houver) e de itens pós-MVP.

## Comments

- 2026-11-04 — Aberto na revisão final: fecha a execução quando o app está pronto para testes em produção.

- 2026-11-05 — Referência Anota (lojista): o smoke e o runbook conferem os estados de T-04 (vazio/carregando/erro) da fila e do `/ops` em [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md); se P-IMP-1 ou P-ONB-2 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md) ficarem na opção recomendada, o runbook ganha o modo quiosque de impressão e o Pedido de teste com Pagamento na entrega cancelado.

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-ONB-5 (espaço do widget de chat de suporte, desligado sem configuração); runbook. Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): sem wa.me de suporte; espaço do widget + base de integração mapeada para agentes.chat/MCP (implementação pós-lançamento); passa a depender de 14 e 15 (20 cortado).
