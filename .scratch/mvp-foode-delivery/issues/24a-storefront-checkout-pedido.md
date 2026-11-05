# 24a — Storefront: checkout, Pedido Guest e acompanhamento

**What to build:** O Consumidor finaliza o Pedido no Storefront numa tela só — Delivery ou Retirada, dados com busca pelo telefone mascarada, CEP, troco, pedido mínimo, tempo estimado, aviso de Privacidade e selo "Ambiente seguro" — e acompanha o Pedido por uma página com token. A `api` cria o Pedido de forma idempotente, com Loja ativa, Pausa, horário, Retirada e bairro verificados na mesma escrita. Este ticket é dono do contrato de Pedido e da configuração operacional da Loja (migration `0004`), que o [24b](24b-painel-operacao-pedido.md) consome no Painel.

**Blocked by:** 23 — Portar Cardápio, Complementos e imagens.

**Status:** ready-for-agent

**Agente:** Opus para contrato/API; Fable para o checkout e a página do Pedido, após o commit de contrato.

### Contrato (commit de contrato, migration `0004`)

- [ ] Schema D1 + Zod em `@foode/shared` do **Pedido** (itens e escolhas em snapshot, Fulfillment, endereço, meio, troco, observação geral, totais em centavos, status, token de acesso, chave de idempotência `UNIQUE` por Loja) e da **configuração operacional da Loja**: horários (`America/Sao_Paulo`, `HH:MM`, sem overnight — [58](../../../docs/decisoes/58-timezone-horarios-loja-mvp.md)), Pausa (estado, quem ativou, quando), Retirada ligada/desligada, Delivery com um modo (por bairro com bairros ativos/inativos, ou Taxa fixa — [42](../../../docs/decisoes/42-taxa-delivery-bairro-ou-fixa.md)), pedido mínimo do Delivery, tempo estimado mín–máx por Fulfillment, bandeiras aceitas na entrega (débito/crédito) e "Imprimir ao aceitar".
- [ ] Estados do Pedido e transições válidas por Fulfillment num module único de `@foode/shared` (base dos Tickets 07–09), usado pela `api`, pelo 24b e pela página do Pedido.
- [ ] `packages/db` expõe as operações escopadas por Loja para ler e gravar a configuração operacional (usadas nos testes deste ticket e pelas RPCs do 24b); o 24b não precisa de nova migration salvo necessidade comprovada.

### Estado da Loja no Storefront

- [ ] Loja fechada (com próximo horário) e Loja em Pausa aparecem como estados distintos no cabeçalho, com Cardápio visível e checkout bloqueado; Loja não `active` mostra Cardápio indisponível (Ticket 07).
- [ ] **Sheet "Sobre a Loja"** no cabeçalho com horários da semana, endereço (só com Retirada ativa — P-3.3), meios de pagamento aceitos (com as bandeiras de débito/crédito na entrega), pedido mínimo e tempo estimado, cada bloco só quando configurado (P-5.1, C6). Descrição, logo e capa entram pelo Ticket 28.
- [ ] Tempo estimado mín–máx de Delivery e de Retirada exibido no cabeçalho/checkout e na página do Pedido quando configurado; sem configuração, nada aparece (P-2.4).

### Checkout

- [ ] O sheet do carrinho perde a nota "Taxa de entrega e pagamento entram na próxima etapa" e ganha o CTA que leva ao checkout deste ticket (feedback do Dono no teste visual de 2026-11-05).
- [ ] Uma tela só, em seções: Seus dados → Como receber → Endereço (Delivery) → Pagamento → Observações → Resumo → "Fazer pedido · R$ total" (X1–X9).
- [ ] Como receber: Delivery e Retirada só quando ativos; com um só, texto fixo sem escolha (X3).
- [ ] **Busca de dados pelo telefone, escopo da Loja (P-2.1)**: ao informar o WhatsApp, a `api` procura dados de Pedidos anteriores **só da mesma Loja**; a resposta é **mascarada** (primeiro nome e rua sem número); os dados completos só preenchem o formulário depois que o Consumidor toca "Sou eu"; consulta com **rate limit por IP e Turnstile**; cada consulta gravada em **auditoria** (Loja, quando, IP truncado/hash, resultado) sem telefone em claro; nenhum dado de outra Loja é consultado. Sem código de verificação ([65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md)).
- [ ] "**Lembrar meus dados neste aparelho**" marcado por padrão, salvo em `localStorage` por Loja, com link "Esquecer meus dados" que apaga na hora (P-2.2).
- [ ] **CEP opcional** no endereço preenche rua e bairro via ViaCEP/BrasilAPI chamado do navegador, com falha silenciosa; o bairro continua escolhido da lista da Loja (pré-seleciona só se o nome bater) (P-3.1). Sem "usar minha localização" (P-3.2).
- [ ] Delivery por bairro ou Taxa fixa recalculado no servidor; bairro inativo não aparece nem é aceito (P-CFG-5).
- [ ] **Pedido mínimo** (só Delivery, opcional) sobre o subtotal dos itens, sem a taxa de Delivery: faixa "Faltam R$ X para o pedido mínimo de R$ Y" no carrinho e no checkout, CTA com esse rótulo, e rejeição no servidor (P-2.5, K7).
- [ ] Pagamento na entrega continua **único** (`on_delivery`, sem subtipo) (P-4.1, P-CFG-3); abaixo dele, as bandeiras aceitas separadas em Débito e Crédito, quando configuradas (P-4.3).
- [ ] "**Troco para**" opcional na própria tela, validado ≥ total no navegador e no servidor, gravado no Pedido (P-4.2).
- [ ] Opções de pagamento neutras, sem destaque nem incentivo a um meio; meio online sem taxa Foode vigente não aparece (P-4.4, [61](../../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)). PIX e Cartão entram nos Tickets 26/27.
- [ ] **Observação geral** do Pedido opcional, até 200 caracteres com contador, gravada no Pedido (P-2.3); não existe observação por item (P-1.5).
- [ ] Aviso com link para a **Política de Privacidade** (página estática `/privacidade` no Storefront) logo acima de "Fazer pedido" (P-6.1).
- [ ] Selo "**Ambiente seguro**" no checkout, no visual Foode (P-6.2).

### Criação do Pedido e acompanhamento

- [ ] Pedido Guest em Retirada e Delivery com snapshots e recálculo no servidor (preços, escolhas, Delivery, mínimo, troco, total) (Tickets 08/09); Guest informa só nome e telefone (+ endereço no Delivery).
- [ ] Loja `active`, Pausa, horário, Retirada ativa e bairro atendido verificados **na mesma escrita** que cria o Pedido (`batch` + `INSERT … SELECT` condicional + constraints) — achado 19.1. Se o `batch` não bastar para contenção, avaliar Durable Object por Loja e registrar decisão.
- [ ] Chave de idempotência `UNIQUE`: retry com a mesma chave devolve o mesmo Pedido, sem duplicar; o botão fica bloqueado contra duplo toque (X7).
- [ ] Página do Pedido por token de acesso, sem vazar outra Loja: status em linguagem do Consumidor com atualização periódica em `aria-live`, resumo, tempo estimado e `wa.me` "Falar com a Loja".

### Testes e revisão

- [ ] Testes: Pausa ativada entre carrinho e envio rejeita; Loja não ativa rejeita; fora do horário rejeita; bairro inativo rejeita; pedido mínimo e troco < total rejeitados no servidor; retry idempotente; vazamento entre Lojas em Pedidos, Delivery e busca por telefone; busca por telefone mascarada, com rate limit, Turnstile e auditoria. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI.
- [ ] UI segue as [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) aplicáveis (G1–G10, C1, C6, K7, X1–X9, §6 página do Pedido) e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared` parseado pelos apps, estado do checkout separado da apresentação, testes que afirmam comportamento).
- [ ] Revisão de segurança no `/code-review` da busca por telefone: máscara, confirmação, rate limit, Turnstile, auditoria, nada de telefone/endereço em logs ou Sentry.

## Comments

- 2026-11-05 — Criado a partir do [Ticket 24](24-portar-operacao-pedido-delivery.md) (dividido em 24a/24b). Consolida os critérios do Storefront com as decisões [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (P-2.1, P-2.2, P-2.3, P-2.4, P-2.5, P-3.1, P-3.3, P-4.1, P-4.2, P-4.3 na exibição, P-4.4 no layout, P-5.1, P-6.1, P-6.2, P-CFG-3, P-CFG-5 na exibição), [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md) (busca por telefone e CEP mantidos com salvaguardas) e [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md) (busca segue sem código). Dono do contrato do Pedido e da configuração operacional (migration `0004`); o 24b só consome.
- 2026-11-05 — Critérios consolidados com 63–65.
- 2026-11-05 — Feedback do Dono no teste visual do Storefront: remover do sheet do carrinho a nota "Taxa de entrega e pagamento entram na próxima etapa"; o carrinho passa a ter o CTA de checkout (critério acrescentado).
- 2026-11-05 — Commit de contrato (branch `feat/24a-contrato-391f`): migration `0004_storefront_pedido` (Pedido, linhas, histórico de status, busca por telefone auditada; configuração operacional, horários e bairros), `@foode/shared/order` (estados, "aberta agora", configuração, checkout, Storefront, Painel), rotas públicas 501 e RPCs do Painel `not_implemented` com guard. Permissões novas `store.pause` e `orders.cancel` (Dono e Operador). Operações de `packages/db` ficam para a fatia API.
