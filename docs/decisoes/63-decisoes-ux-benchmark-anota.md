# 63 — Decisões de UI/UX a partir do benchmark Anota.ai

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono

**Fonte:** prints e notas em [`docs/referencias/anota-ai/`](../referencias/anota-ai/) e as análises críticas [MAPA-UX-CLIENTE](../referencias/anota-ai/MAPA-UX-CLIENTE.md), [DIRETRIZES-UX-CLIENTE](../referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md), [MAPA-UX-LOJISTA](../referencias/anota-ai/MAPA-UX-LOJISTA.md) e [DIRETRIZES-UX-LOJISTA](../referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md).

O concorrente é inspiração, não verdade: as diretrizes valem onde não conflitam com esta decisão. A identidade visual é sempre a da Foode ([ADR 0005](../adr/0005-brand-foode-outline-taste-skill.md)). "(rec.)" indica que o Dono seguiu a recomendação da análise; "(Dono)" indica escolha diferente da recomendada.

## Storefront e compra do Consumidor

| Código | Decisão | Ticket |
| --- | --- | --- |
| P-1.1 | Opção de Complemento com `priceCents` opcional (padrão 0). (rec.) | 23 |
| P-1.2 | Sem meio a meio no MVP; pizzaria usa grupo "Sabores" com até 2 opções. (rec.) | 23 |
| P-1.3 | Sem preço "de/por". (rec.) | — |
| P-1.4 | Busca de itens no Storefront, filtro no navegador. (rec.) | 23 |
| P-1.5 | **Sem observação por item.** (Dono) | — |
| P-2.1 | **Buscar dados do Consumidor pelo telefone, escopo da Loja.** (Dono) Salvaguardas obrigatórias (LGPD, decisão 43): só dentro da mesma Loja; resposta mascarada (primeiro nome e rua sem número), dados completos só depois que o Consumidor confirmar que é ele; rate limit por IP e Turnstile na consulta; auditoria. | 24 (+13) |
| P-2.2 | "Lembrar meus dados neste aparelho" marcado por padrão, `localStorage` por Loja, link "Esquecer meus dados". (rec.) | 24 |
| P-2.3 | Observação geral do Pedido até 200 caracteres, no Painel e na impressão. (rec.) | 24 |
| P-2.4 / P-CFG-1 | Tempo estimado mín–máx por tipo (Delivery e Retirada), opcional. (rec.) | 24 |
| P-2.5 / P-CFG-2 | Pedido mínimo opcional só para Delivery, conferido no servidor, "Faltam R$ X". (rec.) | 24 |
| P-3.1 | **CEP opcional no checkout preenche rua e bairro** (ViaCEP/BrasilAPI, falha silenciosa; o bairro continua escolhido da lista da Loja). (Dono) | 24 |
| P-3.2 | Sem "usar minha localização". (rec.) | — |
| P-3.3 | Endereço da Loja no Storefront só com Retirada ativa. (rec.) | 24/28 |
| P-3.4 | **Vários endereços salvos para Consumidor com conta.** (Dono) | 13 |
| P-4.1 | **Pagamento na entrega continua único** (`on_delivery`). (Dono) | — |
| P-4.2 | "Troco para" opcional na própria tela, validado ≥ total, no Pedido e na impressão. (rec.) | 24 |
| P-4.3 | **Mostrar bandeiras aceitas na maquininha separadas em Débito e Crédito, só as principais (3–4: Visa, Mastercard, Elo, …), configuráveis pela Loja.** (Dono) | 24/28 |
| P-4.4 | **Sem incentivo ao PIX**; opções neutras. (Dono) | 26 |
| P-4.5 | Sem carteiras (confirmado pela pesquisa: provedores não oferecem). (rec.) | 27 |
| P-5.1 | Sheet "Sobre a Loja" no cabeçalho (horários, endereço, meios, mínimo). (rec.) | 24 |
| P-5.2 | Sem barra inferior de abas. (rec.) | — |
| P-5.3 | Sem tema escuro. (rec.) | — |
| P-5.4 | Compartilhar Loja e item (Web Share + copiar link). (rec.) | 23/28 |
| P-5.5 | **Destaques: até 4 itens marcados pelo Dono, em carrossel no topo.** (Dono) | 23 |
| P-6.1 | Aviso com link para a Política de Privacidade (página estática) antes de "Fazer pedido". (rec.) | 24 |
| P-6.2 | **Selo "Ambiente seguro" no checkout, como o concorrente.** (Dono) | 24 |
| P-7.1 / P-CUP-4 | Sem vitrine de Cupons; só código. (rec.) | 13 |
| P-DS-1 | Token `--color-primary-strong` (≈ `#D63A3A`, ≥ 4,5:1) para fundos com texto e links; `#F35050` segue em bordas, ícones, foco e marca. (rec.) | 23 (ui) |

## Painel do Dono e do Operador

| Código | Decisão | Ticket |
| --- | --- | --- |
| P-OPE-1 | Sem aceite automático. (rec.) | — |
| P-OPE-2 | Chips "Todos / Delivery / Retirada" na fila; sem busca. (rec.) | 24 |
| P-OPE-3 | Motivo de cancelamento: lista curta opcional. (rec.) | 12 |
| P-OPE-4 | **O Operador ativa e retoma a Pausa**; ação auditada e Dono avisado no Painel. Altera [41](41-loja-fechada-pause-checkout.md) e [38](38-rbac-dono-operador-mvp.md) nesse ponto. (Dono) | 24 |
| P-OPE-5 | Sem "Concluir" em lote. (rec.) | — |
| P-IMP-1 | **Botão "Imprimir ao aceitar"** (um clique muda o status e abre a impressão 80 mm). (Dono) | 24 |
| P-IMP-2 | Cupom impresso com rodapé fixo, sem campos personalizáveis. (rec.) | 24 |
| P-PDV-1 | **Nenhum atalho para Pedido de telefone**; PDV segue fora ([62](62-escopo-ops-multiloja-funcionalidades.md)). (Dono) | — |
| P-WPP-1 | Botão "Avisar no WhatsApp" (`wa.me`) no detalhe do Pedido, texto fixo por status com link de acompanhamento. (rec.) | 24 |
| P-CUP-1 | Teto opcional de desconto em Cupom percentual. (rec.) | 13 |
| P-CUP-2 | Sem Cupom de frete. (rec.) | — |
| P-CUP-3 | **Cupom válido só em dias da semana escolhidos (D S T Q Q S S).** (Dono) | 13 |
| P-CUP-5 | 2–3 modelos que preenchem o formulário de Cupom. (rec.) | 13 |
| P-REL-1 | **Exportar relatório em PDF e XLSX** (sem telefone/endereço). (Dono) | 14 |
| P-REL-2 | **Top 10 itens + quebra por dia da semana.** (Dono) | 14 |
| P-REL-3 | **TOP 10 clientes por valor, sem exportação** (mostrar só nome e totais; base legal: execução do contrato/legítimo interesse do Dono). (Dono) | 14 |
| P-REL-4 | **Funil de conversão próprio do Storefront** (visita → item → carrinho → checkout → Pedido), eventos agregados por Loja sem dado pessoal. (Dono) | 14 (+28 eventos) |
| P-REL-5 | Comparativo com o período anterior nos números do topo (seta + texto). (rec.) | 14 |
| P-ONB-1 | **Tour de 3 passos na primeira visita à fila**, com Pedido fictício só na tela (nada gravado), pulável e que não se repete. (Dono) | 28 |
| P-ONB-2 | **Sem Pedido de teste antes de abrir a Loja.** (Dono) | — |
| P-ONB-3 / P-CAR-4 | O próprio Dono cadastra o Cardápio; sem itens fictícios; Cardápio vazio mostra como começar. (Dono) | 23/28 |
| P-ONB-4 | **Duas perguntas de perfil no primeiro acesso (culinária e objetivo), gravadas para a Foode** (dados do Dono/Loja, uso interno, informado na tela). (Dono) | 28 (+29 leitura no Ops) |
| P-ONB-5 | **Widget de chat de suporte no Painel**, atendido por agente do agentes.chat com base na codebase, critérios de resposta e escalada ao Dono da Foode; conexão por MCP. No MVP: espaço do widget e carregamento configurável (desligado sem configuração); o agente e o MCP são trabalho à parte. (Dono) | 30 |
| P-CFG-3 | Pagamento na entrega segue único; o "Troco para" vem do P-4.2. | 24 |
| P-CFG-4 | CEP opcional no cadastro de endereço da Loja (Ops e Dono). (rec.) | 29/28 |
| P-CFG-5 | Interruptor de bairro ativo/inativo. (rec.) | 24 |
| P-CAR-1 | "Copiar grupos de outro item"; sem grupos compartilhados. (rec.) | 23 |
| P-CAR-2 | Sem categoria "Pizza"/meio a meio (igual P-1.2). (rec.) | — |
| P-CAR-3 | Sem classificações (vegano etc.). (rec.) | — |
| P-CAR-5 | Sem edição em massa; preço inline. (rec.) | 23 |
| P-VIS-1 | Logo quadrado da Loja no Storefront. (rec.) | 28 |
| P-VIS-2 | **Imagem de capa da Loja (sem cor personalizada).** (Dono) | 28 |
| P-VIS-3 | Descrição curta da Loja (até 160 caracteres, também meta description). (rec.) | 28 |
| P-PLN-1 | Progresso da faixa só na tela Plano. (rec.) | 14 |

## Consequências

- Os tickets listados recebem estes itens como critérios adicionais (anotados em `## Comments` de cada um em 2026-11-05).
- P-2.1 e P-REL-3 tratam dado pessoal: implementar com as salvaguardas acima e revisar no `/code-review` de segurança do ticket.
- P-OPE-4 substitui, só no ponto da Pausa, as decisões 41 e 38.
