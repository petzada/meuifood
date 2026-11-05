# 24b — Painel: horários, Pausa, entrega, fila de Pedidos e impressão

**What to build:** No Painel, o Dono configura horários, Retirada, Delivery por bairro (com interruptor por bairro) ou Taxa fixa, pedido mínimo, tempo estimado, bandeiras da maquininha e "Imprimir ao aceitar"; Dono e Operador ativam e retomam a Pausa e operam a fila de Pedidos por polling com som, chips por Fulfillment, estados, detalhe, impressão 80 mm e "Avisar no WhatsApp" — como nos Tickets 07–09, sobre o contrato criado pelo [24a](24a-storefront-checkout-pedido.md).

**Blocked by:** 24a — só o commit de contrato (migration `0004`, Zod do Pedido e da configuração operacional, module de estados). A fila pode ser construída com Pedidos criados pelas operações de `packages/db` nos testes; não espera a UI do checkout.

**Status:** ready-for-agent

**Agente:** Opus para as RPCs; Fable para as telas e a impressão 80 mm, após as RPCs.

### Configuração da Loja (Dono)

- [ ] Horários portados com os testes do Ticket 07: grade Seg–Dom com períodos `HH:MM`, "+ período", "Copiar para todos os dias", erro inline (início ≥ fim, sobreposição), sem campo de fuso (CFG-01).
- [ ] Entrega: Retirada liga/desliga e Delivery com **um modo** — "Por bairro" ou "Taxa fixa" — com aviso do que deixa de valer ao trocar (CFG-03, [42](../../../docs/decisoes/42-taxa-delivery-bairro-ou-fixa.md)); por bairro, tabela Bairro · Taxa · **interruptor ativo/inativo** por bairro (P-CFG-5).
- [ ] **Pedido mínimo** opcional só para Delivery e **tempo estimado** mín–máx por Fulfillment (Delivery e Retirada), opcionais, com validação (mín ≤ máx) no servidor (P-CFG-1, P-CFG-2).
- [ ] **Bandeiras aceitas na maquininha**, separadas em Débito e Crédito, escolhidas de uma lista curta fixa das principais (3–4: Visa, Mastercard, Elo, …; definida no contrato); nenhuma marcada = nada exibido no Storefront (P-4.3).
- [ ] Configuração "**Imprimir ao aceitar**" (liga/desliga, padrão desligado): ligada, aceitar o Pedido muda o status e abre a impressão 80 mm no mesmo clique (P-IMP-1, [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- [ ] Configurações em subrotas de `/configuracoes` (`/configuracoes/horarios`, `/configuracoes/entrega`), cada seção salva sozinha (NAV-05, T-07). O Operador não acessa nenhuma delas.

### Pausa (Dono e Operador)

- [ ] **Dono e Operador ativam e retomam a Pausa** (P-OPE-4, altera [41](../../../docs/decisoes/41-loja-fechada-pause-checkout.md) e [38](../../../docs/decisoes/38-rbac-dono-operador-mvp.md) só neste ponto); o Operador não acessa horários nem outra configuração.
- [ ] Toda ativação/retomada é auditada (quem, papel, quando) e, quando feita pelo Operador, o Dono vê aviso no Painel ("Pausa ativada por Nome às HH:MM").
- [ ] Pausa no selo de status da Loja do shell (para Dono e Operador) e no topo de Horários, mesmo estado; ligar pede confirmação curta; com Pausa ativa, faixa persistente "Loja em Pausa — Retomar" (CFG-02, NAV-04).
- [ ] Pausa bloqueia o checkout imediatamente (conferida na escrita do Pedido pelo 24a).

### Fila e detalhe (Dono e Operador)

- [ ] Fila por polling de 10 s com som uma vez por Pedido novo; faixa "Clique para ativar o som" enquanto o navegador bloquear áudio; indicador "Atualizado há N s" e "Sem conexão — tentando de novo" sem limpar a lista (PED-04 a PED-06, [23](../../../docs/decisoes/23-realtime-pedidos-polling.md)).
- [ ] Chips "**Todos / Delivery / Retirada**" filtram a fila; sem busca (P-OPE-2).
- [ ] Fila em colunas por estado no desktop/tablet; card com código, tempo decorrido, nome, selo de Fulfillment e de pagamento, total e um botão de avanço com destino explícito; só transições válidas do module de estados; conclusão manual (PED-01 a PED-03).
- [ ] Sem aceite automático (P-OPE-1) e sem "Concluir" em lote (P-OPE-5); nenhum atalho de Pedido por telefone/PDV (P-PDV-1).
- [ ] Aba do navegador conta Pedidos novos não abertos (NAV-07); fila vazia com texto por papel (PED-08).
- [ ] Detalhe do Pedido (painel lateral no desktop, tela cheia no celular): itens com Complementos/Adicionais, **observação geral**, Fulfillment e endereço, pagamento e "**Troco para**", telefone, botões Imprimir, avançar e Cancelar (o Cancelar com Estorno é do Ticket 12) (PED-07).
- [ ] Botão "**Avisar no WhatsApp**" no detalhe: abre `wa.me` para o telefone do Consumidor com **texto fixo por status** e o link da página de acompanhamento do Pedido; ação por Pedido, sem envio automático (P-WPP-1, [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- [ ] **Tour de 3 passos** na primeira visita à fila, com Pedido fictício só na tela (nada gravado), pulável e que não se repete para o mesmo usuário (P-ONB-1; prevalece sobre PED-09 por ser decisão; movido do 28 porque a fila nasce aqui). Sem Pedido de teste antes de abrir a Loja (P-ONB-2).

### Impressão 80 mm

- [ ] Botão Imprimir no detalhe: layout de cupom 80 mm via `window.print` com CSS `@media print` que esconde o Painel — Fulfillment em faixa invertida grande, código, hora, itens, escolhas, observação geral, endereço, pagamento, **troco**, total (IMP-01, IMP-02).
- [ ] Cupom impresso com **rodapé fixo** (sem campos personalizáveis) e sem configuração de impressora no Painel (P-IMP-2).

### Testes e revisão

- [ ] Testes: RBAC (Operador pausa/retoma, mas é negado em horários, entrega, bandeiras e "Imprimir ao aceitar", sem efeito persistido); auditoria da Pausa; transições inválidas rejeitadas; bairro inativo; mín ≤ máx; vazamento entre Lojas na fila, no detalhe e na configuração. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI.
- [ ] UI segue as [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) aplicáveis (PED-01 a PED-08, IMP-01/IMP-02, CFG-01 a CFG-03, NAV-03 a NAV-05, NAV-07, T-01 a T-12) e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, matriz "papel → áreas visíveis" em module consumido pela navegação e pelos dados, feedback por querystring em module, testes que afirmam a matriz de papéis em vez de substrings de HTML).

## Comments

- 2026-11-05 — Criado a partir do [Ticket 24](24-portar-operacao-pedido-delivery.md) (dividido em 24a/24b). Consolida os critérios do Painel com as decisões [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (P-OPE-1, P-OPE-2, P-OPE-4, P-OPE-5, P-IMP-1, P-IMP-2, P-PDV-1, P-WPP-1, P-CFG-1, P-CFG-2, P-CFG-5, P-4.3 na configuração, P-ONB-1, P-ONB-2) e [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md) ("Imprimir ao aceitar" como configuração da Loja; "Avisar no WhatsApp" por Pedido). Migration própria só se necessária (`0006` reservada). O tour de 3 passos (P-ONB-1) veio do Ticket 28 porque depende da fila.
- 2026-11-05 — Critérios consolidados com 63–65.
