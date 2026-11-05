# 14 — Plano e faixa no Painel, relatórios, Repasses e lotes diários

**What to build:** O Dono vê Plano, faixa e contagem de Pedidos do mês, relatórios (com exportação CSV e impressão, top itens, TOP 10 clientes com conta e funil próprio) e a tela Repasses (só leitura); o Ops opera os lotes diários de repasse por Loja e acompanha a margem.

**Blocked by:** 12 — Cancelar Pedido e executar Estorno automático.

**Status:** ready-for-agent

**Agente:** Opus para apuração/lotes; Fable para as telas, após o contrato.

### Plano

- [ ] Dono vê Plano (mensal/anual), faixa vigente e contagem de Pedidos não cancelados do mês civil; sem cobrança, recorrência ou bloqueio por faixa.
- [ ] O progresso da faixa (barra até o limite da faixa e valor da faixa) aparece **só** na tela `/plano`, sem banner em outras telas (P-PLN-1, REL-03).

### Relatórios (`/relatorios`)

- [ ] Relatórios por período (Hoje · 7 dias · 30 dias · Mês atual · Personalizado): Pedidos por status, Fulfillment e meio; GMV só como métrica.
- [ ] Números do topo (Pedidos, Cancelados, Total vendido, Ticket médio) com **comparativo com o período anterior de mesma duração**: seta + texto ("+12% vs. 7 dias anteriores"), nunca só cor (P-REL-5).
- [ ] **Top 10 itens** por quantidade no período, com **quebra por dia da semana** (Dom–Sáb) (P-REL-2).
- [ ] **TOP 10 clientes por valor** no período: só Consumidores **com conta na Foode** (Ticket 13) e Pedidos da própria Loja; Guest nunca aparece, mesmo comprando muito; mostra só nome, quantidade de Pedidos e total; sem telefone, CPF ou endereço; **sem exportação** (P-REL-3 + [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- [ ] **Funil de conversão próprio** do Storefront (visita → item → carrinho → checkout → Pedido) lido dos eventos agregados por Loja gravados pelo Ticket 28 (e do próprio Pedido), sem dado pessoal; o Pixel Meta/Google não é fonte do funil (P-REL-4).
- [ ] Exportação em **CSV** (UTF-8 com BOM, separador compatível com o Excel pt-BR) dos agregados do período, sem telefone, CPF ou endereço; sem PDF/XLSX gerado no servidor ([64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- [ ] Botão **Imprimir** usa a impressão do navegador com CSS `@media print` que esconde o Painel (o Dono salva em PDF pelo navegador).
- [ ] Vazio "Nenhum Pedido neste período" + atalho para mudar o período; erro com "Tentar de novo" (REL-02).

### Repasses e Ops

- [ ] Tela **Repasses** (Dono, só leitura): lançamentos (Pedido, meio, total, taxa Foode, líquido, repasse previsto, status Previsto / Em lote / Pago / Débito de Estorno) e lotes pagos; nunca mostra custo do provedor (REL-04).
- [ ] `/ops` **A repassar hoje**: por Loja, total dos lançamentos com repasse previsto até hoje, chave Pix e titular, débitos de Estorno compensados; botão marcar lote pago com data, conta de saída (Efí/AbacatePay), identificador/comprovante e custo do envio, com confirmação que resume o que muda (OPS-04).
- [ ] Lote pago é imutável; correção por lançamento de ajuste auditado.
- [ ] `/ops` margem por Loja e período: taxa Foode − custo do provedor − custo de envio.
- [ ] Operador não acessa Plano, relatórios, Repasses nem agregados; rotas no grupo Financeiro do menu do Dono (NAV-01/NAV-02).

### Testes e revisão

- [ ] Testes: dias úteis/feriados, Estorno antes e depois do repasse, lote idempotente, RBAC; TOP 10 sem Guest e sem outra Loja; CSV sem colunas de dado pessoal e com BOM; comparativo com período anterior; funil sem dado pessoal. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI.
- [ ] UI segue as [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) aplicáveis (REL-01 a REL-04, NAV-01/NAV-02, OPS-01/OPS-04, T-03, T-04) e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, regra separada da apresentação, matriz de papéis em module, testes que afirmam comportamento).
- [ ] Revisão de segurança no `/code-review`: TOP 10 e CSV não expõem dado pessoal além de nome; base legal do TOP 10 (execução do contrato/legítimo interesse do Dono) citada no código ou no ticket.
- [ ] Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md): tarifa de serviço é receita da Foode, separada do líquido e do repasse nos relatórios e lotes.

## Comments

- 2026-11-04 — Revisado por [60](../../../docs/decisoes/60-pagamentos-efi-abacatepay.md) e [61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md): faixas por Pedidos, lote diário D+1 útil.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) REL-01 a REL-04, NAV-01/NAV-02 (rotas `/relatorios`, `/repasses`, `/plano` no grupo Financeiro; sugestão de permissão `store.finance`) e OPS-01/OPS-04 para os lotes; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §1, §7 e §15. Em aberto: P-REL-1 a P-REL-5 e P-PLN-1 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-REL-1 (PDF+XLSX), P-REL-2 (top 10 + dia da semana), P-REL-3 (TOP 10 clientes), P-REL-4 (funil próprio), P-REL-5 (comparativo), P-PLN-1. Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): exportação CSV + impressão em PDF pelo navegador (sem PDF/XLSX no servidor); TOP 10 clientes só com conta Foode (nunca Guest); funil próprio mantido; top itens com dia da semana.

- 2026-11-05 — Critérios consolidados com 63–65: P-REL-1 na forma da 64 (CSV + imprimir), P-REL-2, P-REL-3 (só com conta, sem exportação), P-REL-4 (eventos do Ticket 28), P-REL-5 e P-PLN-1 entraram no checklist, com revisão de segurança dos dados pessoais.

- 2026-11-05 — Decisão [71](../../../docs/decisoes/71-tarifa-servico-parcelamento-anual.md) aplicada.
