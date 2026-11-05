# Decisão: monetização inspirada no Anota AI — faixas por pedidos, taxas no `/ops`

**Data:** 2026-11-04 · **Status:** decidido · **Sessão:** benchmark Anota AI (perguntas objetivas ao Dono)  
**Depende de:** [60](60-pagamentos-efi-abacatepay.md)

**Supersede:** [04](04-modelo-receita-saas-tiers-pagamento.md), [11](11-planos-por-faturamento-features-completas.md), [12](12-faixas-mensalidade-por-gmv.md), [32](32-taxas-e-assinatura-fixa-unica.md), [33](33-teto-gmv-comercial-fora-do-produto.md) e a parte de valores de [35](35-ui-billing-plano-painel.md). [31](31-definicao-operacional-gmv.md) continua só como métrica de relatório.

## Referência (Anota AI, lido em 2026-11-04)

- Plano único com faixas por pedidos/mês: R$ 99,99 (até 150), R$ 199,99 (151–250), R$ 299,99 (250+); anual 12× R$ 99,99 com pedidos ilimitados; sem comissão; sem fidelidade; teste de 7 dias.
- Pagamento online: PIX 0,99% (D+1 útil), débito 1,99% (D+1), crédito 3,49% (30 dias úteis), 4,49% (7 dias úteis) ou 4,69% (D+1).

## Decisão

### Mensalidade

- **Faixas por quantidade de Pedidos do mês civil** (Pedidos não cancelados feitos no Canal próprio), com valores **15% abaixo do Anota**, editáveis no `/ops` com vigência:

| Faixa | Mensal |
| --- | --- |
| Até 150 Pedidos | R$ 84,99 |
| 151 a 250 Pedidos | R$ 169,99 |
| Acima de 250 Pedidos | R$ 254,99 |
| Anual (pedidos ilimitados) | 12× R$ 84,99 = R$ 1.019,88 |

- Cobrança **fora do app**; o Ops ativa o Plano (mensal ou anual) e a Loja só recebe Pedidos com Plano ativo.
- O Painel mostra ao Dono o Plano, a faixa atual e a contagem de Pedidos do mês. A faixa é apurada pelo app; mudança de faixa é informativa (a cobrança segue fora).
- **Sem teste grátis** e **sem fidelidade**.

### Taxas de pagamento ao lojista

- Uma **taxa Foode única por meio/modo** (% + fixo opcional), com a margem embutida sobre o custo do provedor; o contrato e o Painel mostram só a taxa Foode, nunca o custo do provedor.
- Posicionamento: **próximo do Anota, com margem mínima** — a receita principal é a mensalidade.
- Cadastro no `/ops`: tabela padrão por meio/modo + **override por Loja** definido no onboarding, sempre com vigência; histórico preservado.
- A tabela nasce **vazia**: meio online sem taxa vigente para a Loja fica indisponível no checkout. Nenhum número é inventado em código.

### Repasse

- D+1 útil após a liberação no provedor, em **lote diário por Loja** ([60](60-pagamentos-efi-abacatepay.md)). Custo do envio do Pix fica com a Foode e é registrado no Ledger.
- Prazos de cartão vendidos: só os dois reais — Normal (Efí) e Rápido (AbacatePay). Sem D+7 antecipado.

## Rejeitado

- Assinatura única R$ 179 / R$ 1.718,40; teto de GMV como âncora; preço livre por Loja sem tabela.
- Taxas acima do Anota; repasse semanal ou por pedido; teste grátis; três prazos de cartão.
