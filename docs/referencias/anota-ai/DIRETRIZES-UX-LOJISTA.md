# Diretrizes de UX do Painel (lojista) — consolidado do benchmark Anota AI

**Data:** 2026-11-05 · **Fonte:** prints `LOJISTA/*.png` e `LOJISTA/PAINEL.md` (Anota AI, loja de teste), lidos contra a [spec v2](../../../.scratch/mvp-foode-delivery/spec.md), as decisões 13, 23, 27, 35, 38, 41, 42, 45, 58–62 e o código de `apps/admin` na branch `feat/22-auth-rbac-391f`.
**Mapa detalhado por tela:** [MAPA-UX-LOJISTA.md](MAPA-UX-LOJISTA.md) · **Perguntas abertas:** [PERGUNTAS-LOJISTA.md](PERGUNTAS-LOJISTA.md)

O Anota é **referência de fluxo, não de verdade**. Daqui vêm layout, hierarquia e sequência; a identidade é 100% Foode ([FOODE-BRAND](../../FOODE-BRAND.md), [ADR 0005](../../adr/0005-brand-foode-outline-taste-skill.md)): primary `#F35050`, Nunito, containers outline com borda fina, sem shadow, componentes de `@foode/ui` (`Button`, `OutlineContainer`, `BrandMark`). Cada diretriz tem um código (ex.: `PED-03`) citado nos tickets.

Nada aqui reabre decisão fechada. Onde o padrão do concorrente colide com uma decisão, a diretriz segue a decisão e a divergência fica anotada.

---

## 1. Transversais (valem para todo o Painel)

| Código | Diretriz |
| --- | --- |
| **T-01** | **Identidade.** Colunas, cards e seções são `OutlineContainer` (borda `--color-hairline`, sem fill, sem shadow). Fill de cor só em CTA primário e em selos pequenos. Nunca colunas inteiras pintadas (o kanban do Anota pinta vermelho/amarelo/verde a coluna toda). |
| **T-02** | **Contraste (achado).** Branco sobre `#F35050` dá **3,5:1** e branco sobre `#E04545` dá **4,1:1**: os dois **reprovam WCAG AA** para texto de 14–16 px (exige 4,5:1). Hoje o item ativo da navegação (`painel-shell.tsx`) e os links em `--color-primary-active` estão abaixo do AA. Ver pergunta P-DS-1 em PERGUNTAS; até decidir, texto sobre primary só em ≥ 18,66 px bold ou com tom mais escuro (`#D63A3A` dá 4,6:1). |
| **T-03** | **Status nunca só por cor.** Todo estado (Pedido, Loja, pagamento, Estorno, Cupom) = texto + ícone + cor. Som também nunca é o único sinal. |
| **T-04** | **Estados obrigatórios em toda tela de dados.** *Vazio*: diz o que é e o próximo passo (com CTA só para quem pode agir). *Carregando*: skeleton no formato do conteúdo (como em `LOJISTA/60-...png`), nunca tela cheia com mascote (`LOJISTA/30-...png`). *Erro*: mensagem específica + "Tentar de novo", mantendo os últimos dados visíveis. *Sucesso*: feedback junto da ação. |
| **T-05** | **Feedback.** Formulário: aviso inline acima do botão (`role="status"`; erro com `role="alert"`), como já fazem `Notice`/`Field`. Ação rápida na fila: toast curto e **específico** ("Pedido #123 em preparo"), nunca o genérico "Prontinho! Operação realizada com sucesso." Sucesso some sozinho (4 s); erro fica até o usuário fechar. |
| **T-06** | **Formulários.** Rótulo visível; erro inline ligado ao campo; máscaras com `inputMode` numérico (CNPJ, WhatsApp, CEP, R$); dinheiro só pelo helper de `@foode/shared`; contador quando há limite. Formulário de **criação**: botão sempre habilitado, valida no envio (o Anota desabilita "Continuar/Avançar" sem dizer por quê). Formulário de **edição**: "Salvar alterações" habilitado só com mudança, com texto "Nenhuma alteração para salvar" e aviso ao sair com mudança pendente. |
| **T-07** | **Seções, não wizards.** Configuração é lista de seções independentes, cada uma salva sozinha e sem numeração (o "1…10" do Anota sugere ordem que não existe). Wizard só onde um passo depende do anterior. |
| **T-08** | **Sem dark patterns.** Proibido: contagem regressiva promocional, faixa de desconto no topo, "Você pode estar limitado!", comparação de medo ("Sem robô: estresse constante"), "Ativar todos" de descontos, badge "NOVO" permanente. O Painel é ferramenta de trabalho. |
| **T-09** | **Toque e densidade.** Alvos ≥ 44 px (o shell já usa `min-h-11`). Três contextos: desktop/notebook ≥ 1024 px (fila em colunas), tablet no balcão 768–1023 px (fila em colunas compactas ou abas), celular < 768 px (abas). Texto mínimo 14 px; nada informativo em 12 px cinza claro. |
| **T-10** | **Acessibilidade.** Foco visível em tudo; tudo operável por teclado (reordenar inclusive); `aria-live="polite"` para Pedido novo e mudanças de fila; respeitar `prefers-reduced-motion`; landmark `main`/`nav` já existem no shell — manter. |
| **T-11** | **Microcopy.** PT-BR direto, termos do glossário com a mesma grafia do código: Pedido, Loja, Cardápio, Complemento, Adicional, Pausa, Retirada, Delivery, Cupom, Repasse. Sem emoji em tela operacional. Botão diz a ação e o destino ("Marcar como Saiu para entrega", não "Avançar →"). |
| **T-12** | **Ação destrutiva.** Confirmação que nomeia o objeto e a consequência ("Cancelar o Pedido #123? O PIX de R$ 54,90 será estornado automaticamente."). Nunca um X vermelho solto no card (Anota, `LOJISTA/21-...png`), colado ao relógio. |

## 2. Navegação e moldura (`lib/access.ts` → `ROUTES`)

| Código | Diretriz |
| --- | --- |
| **NAV-01** | **Encaixe nas ROUTES.** Hoje: `/` Pedidos · `/cardapio` · `/configuracoes` · `/equipe` · `/ops`. Os tickets acrescentam **uma linha por área**: `/cupons` (13), `/relatorios`, `/repasses` e `/plano` (14). Permissão: Cupons sob `store.settings`; Relatórios/Repasses/Plano com uma permissão nova só do Dono (sugestão `store.finance`), para não amarrar finanças a "configurações" — decisão de código do Ticket 14. |
| **NAV-02** | **Agrupar no menu do Dono** (no máximo 8 itens, 3 grupos): *Operação* — Pedidos · *Loja* — Cardápio, Cupons, Configurações, Equipe · *Financeiro* — Relatórios, Repasses, Plano. Um campo opcional `group` em `RouteRule` resolve sem mudar `navFor`. O Anota tem ~60 entradas em 7 grupos, com submenus e busca "Procurando por algo?": não adotar (precisa de busca porque o menu não cabe na cabeça). |
| **NAV-03** | **Operador sem sidebar.** Com um só item (Pedidos), o shell do Operador vira barra superior (marca, Loja, status da Loja, nome, Sair) e a fila ocupa a largura toda. |
| **NAV-04** | **Status da Loja no shell, para todos.** Selo ao lado do nome da Loja: `Aberta` / `Fechada · abre às HH:MM` / `Em Pausa` / `Em configuração` (onboarding) / `Suspensa`. Para o Dono o selo abre um popover com "Pausar Pedidos agora" e link para Horários; para o Operador é só leitura ([41](../../decisoes/41-loja-fechada-pause-checkout.md), [38](../../decisoes/38-rbac-dono-operador-mvp.md)). |
| **NAV-05** | **Configurações em subrotas** sob o mesmo prefixo (sem novas linhas no menu): `/configuracoes/loja` (contato, Slug), `/configuracoes/horarios` (horários + Pausa), `/configuracoes/entrega` (Retirada, Delivery por bairro ou Taxa fixa), `/configuracoes/divulgacao` (link, QR Code, Pixel). `/configuracoes` mostra a lista de seções com selo "Pendente" vindo do checklist. |
| **NAV-06** | **Título sempre; breadcrumb só no 3º nível** (ex.: Cardápio › Lanches › Misto Quente). O Anota põe breadcrumb em toda página, inclusive de 1º nível. |
| **NAV-07** | **Aba do navegador conta Pedidos novos:** `(2) Pedidos · Foode` enquanto houver Pedido em "Recebido" não aberto — a fila costuma ficar em segundo plano no notebook do balcão. |
| **NAV-08** | **Multi-Loja.** O seletor (`StoreSwitcher`) mostra o selo de status de cada Loja; trocar de Loja recarrega a página atual se o papel na nova Loja permitir, senão vai para a home do papel. |

## 3. Operação — Dono e Operador (fila, impressão, cancelamento)

| Código | Diretriz |
| --- | --- |
| **PED-01** | **Fila em colunas por estado** no desktop/tablet: *Recebidos* · *Em preparo* · *Prontos / Saiu para entrega* (Pronto para retirada e Saiu para entrega na mesma coluna, distinguidos pelo selo de Fulfillment). Concluídos e Cancelados fora das colunas, num link "Concluídos hoje (N)". No celular, abas com contador. Colunas outline, cabeçalho com nome + contador (T-01, T-03). |
| **PED-02** | **Card do Pedido** (ordem de leitura): código `#123` grande · tempo desde que chegou ("há 4 min") · nome do Consumidor · selo de Fulfillment (Delivery + bairro / Retirada) · selo de **pagamento** (`Pago online` ou `Pagar na entrega`) · total · botão de avanço. Telefone e endereço completos só no detalhe. O card do Anota não mostra se o Pedido está pago — falha grave para quem entrega e cobra. |
| **PED-03** | **Botão de avanço com destino explícito**, um por card: "Começar preparo", "Marcar como Pronto para retirada" / "Marcar como Saiu para entrega", "Concluir". Só transições válidas de `allowedOrderTransitions` aparecem. Não há "voltar status": por isso o rótulo diz o destino. |
| **PED-04** | **Pedido novo chama atenção sem pânico:** borda primary + selo "Novo" até ser aberto; `aria-live`; título da aba (NAV-07); som uma vez ([23](../../decisoes/23-realtime-pedidos-polling.md)). **Tempo decorrido**, não contagem regressiva: o "Expira em 00:14:48" do Anota cancela sozinho, o que não existe no nosso domínio. Após N min em Recebido o tempo vira destaque (accent). |
| **PED-05** | **Som que funciona.** Navegador bloqueia áudio sem gesto: enquanto o som não foi liberado, faixa fixa "Clique para ativar o som de novos Pedidos". Depois, indicador "Som ligado" com opção de silenciar por esta sessão. |
| **PED-06** | **Atualização visível.** Indicador discreto "Atualizado há 8 s" (o Anota mostra "Pedidos atualizados" fixo, sem hora). Falha de polling: mantém a fila, troca o indicador por "Sem conexão — tentando de novo" em destaque; nunca limpa a lista. |
| **PED-07** | **Detalhe do Pedido** em painel lateral (desktop) ou tela cheia (celular): itens com Complementos/Adicionais/observações, Fulfillment e endereço, pagamento e status do pagamento, telefone com link `wa.me`, botões Imprimir, avançar e Cancelar (este por último, estilo secundário destrutivo). |
| **PED-08** | **Fila vazia por papel.** Dono com Loja ativa: "Nenhum Pedido agora. Divulgue o link da sua Loja" + "Copiar link" (adaptado do banner de `LOJISTA/51-...png`). Operador: "Nenhum Pedido agora. Novos Pedidos aparecem aqui com aviso sonoro." Loja não ativa: o checklist (ONB-01) ocupa o lugar. |
| **PED-09** | **Sem tour de popovers.** O tour de 4 passos com Pedido de exemplo (`LOJISTA/19`–`24`) não entra: a fila tem 3 colunas e um botão por card; um texto de ajuda de uma linha no estado vazio basta. |
| **IMP-01** | **Imprimir pelo detalhe**, layout 80 mm via `window.print` (Ticket 24): no topo, Fulfillment em **faixa invertida grande** ("DELIVERY" / "RETIRADA") — adaptado da "notificação chamativa" da comanda (`LOJISTA/44-...png`); depois código, hora, Consumidor, itens com escolhas e observações, endereço, pagamento (pago/na entrega), total. |
| **IMP-02** | **Pré-visualização** no próprio botão (o que sai é o que se vê) e CSS `@media print` que esconde o Painel. Sem configuração de impressora no Painel. |
| **CAN-01** | **Cancelar = diálogo de confirmação** com a consequência financeira escrita: on_delivery "O Pedido será cancelado."; PIX/Cartão pago "R$ X serão estornados automaticamente ao Consumidor."; cobrança pendente "A cobrança será cancelada." |
| **CAN-02** | **Estorno visível separado do Pedido:** selo "Estorno em andamento / Estorno concluído / Estorno falhou — nova tentativa automática" no card de Cancelados e no detalhe; nunca reabre o Pedido ([12](../../../.scratch/mvp-foode-delivery/issues/12-cancelamento-estorno-automatico.md)). |

## 4. Dono — configuração, Cardápio, Cupons, finanças

| Código | Diretriz |
| --- | --- |
| **ONB-01** | **Checklist num só lugar:** card no topo de `/` (Pedidos) enquanto a Loja não estiver pronta, com "Faltam N passos para sua Loja receber Pedidos". Itens do Ticket 28 vindos do servidor: contato, Slug, horários, Fulfillment, Cardápio com item disponível, Plano ativo. Cada item: Feito/Pendente + uma linha de porquê + "Configurar" (link direto à seção). Pixel aparece como "Opcional", fora da contagem. O Anota repete o checklist em 3 lugares (tela própria, widget flutuante "Comece por aqui 1/4", alerta vermelho na sidebar): não. |
| **ONB-02** | **Sem ordem forçada.** O Anota trava o passo 3 até concluir 1 e 2; aqui qualquer item pendente é clicável. "Plano ativo" é item **não acionável**: "A equipe Foode ativa seu Plano depois da contratação." |
| **ONB-03** | **Sem perguntas de perfil nem Cardápio-semente.** Culinária/objetivo e Cardápio gerado (`LOJISTA/09`–`14`) não entram: o Ops já cadastrou a Loja e itens fictícios viram lixo a apagar. |
| **ONB-04** | **Ao concluir, o checklist some** e aparece uma vez "Sua Loja está pronta para receber Pedidos" com "Copiar link" e "Baixar QR Code". |
| **LNK-01** | **Divulgação** (`/configuracoes/divulgacao`): link `https://foodedelivery.com.br/loja/{slug}` em campo só leitura + "Copiar link" (feedback "Link copiado" por 2 s, `aria-live`), "Baixar QR Code (PNG)" e "(SVG)", "Abrir minha Loja" em nova aba. Prévia do QR na tela. |
| **LNK-02** | **Editar Slug** com validação no servidor e aviso **antes** de salvar: "Links e QR Codes já divulgados param de funcionar." Mostra o link resultante enquanto digita. |
| **LNK-03** | **Pixel:** dois campos (Meta, Google) com exemplo de formato e "Opcional"; erro de formato inline. |
| **CFG-01** | **Horários:** grade por dia (Seg–Dom) com períodos `HH:MM` início/fim e "+ período", "Copiar para todos os dias"; erro inline por período (início ≥ fim, sobreposição). **Sem campo de fuso** ([58](../../decisoes/58-timezone-horarios-loja-mvp.md)); legenda "Horário de Brasília". Sem as opções "Sempre disponível / só agendados / fechado permanentemente" do Anota ([41](../../decisoes/41-loja-fechada-pause-checkout.md), [13](../../decisoes/13-cardapio-mvp.md)). |
| **CFG-02** | **Pausa** em dois lugares, mesmo estado: popover do selo (NAV-04) e topo de Horários. Ligar pede confirmação curta ("O checkout fica bloqueado até você retomar"); com Pausa ativa, faixa persistente no Painel do Dono "Loja em Pausa — Retomar". |
| **CFG-03** | **Entrega:** Retirada (liga/desliga) e Delivery com **um modo** — seletor segmentado "Por bairro" / "Taxa fixa" ([42](../../decisoes/42-taxa-delivery-bairro-ou-fixa.md)). Trocar de modo avisa o que deixa de valer. Por bairro: tabela Bairro · Taxa · ações, busca a partir de 10 linhas, "Total de N bairros", "+ Bairro" em linha (sem modal). Sem "Raio", sem "cliente pode editar bairro/cidade" do Anota. Pelo menos uma forma ativa (Retirada ou Delivery), com erro claro. |
| **CFG-04** | **Dados da Loja:** contato (WhatsApp com máscara) e o que o Ticket 28 pedir; dados que o Ops cadastrou (CNPJ, chave Pix, titular) aparecem **só leitura** com "Para alterar, fale com a equipe Foode". |
| **CAR-01** | **Gestor em dois painéis** no desktop: categorias à esquerda (lista ordenável, "+ Nova categoria"), itens da categoria à direita (`LOJISTA/52-...png`). No celular: categorias em acordeão. |
| **CAR-02** | **Disponibilidade inline** por item e categoria, com rótulo de **estado** ("Disponível" / "Esgotado"), não de ação ("Esgotar" do Anota é ambíguo ligado/desligado). Mudança salva na hora com feedback. |
| **CAR-03** | **Preço inline** só com confirmação explícita (Enter ou ✓; Esc desfaz); nunca salvar no blur sem aviso. |
| **CAR-04** | **Reordenar** por arrastar **e** por botões "Mover para cima/baixo" (teclado e leitor de tela). |
| **CAR-05** | **Item numa página só**, em seções: Dados (nome, descrição, preço, foto) · Complementos · Adicionais · Disponibilidade. Não o wizard de 4 passos com toast a cada passo (`LOJISTA/55`–`63`). |
| **CAR-06** | **Grupo de Complemento** com cartões "Opcional / Obrigatório" e steppers Mínimo/Máximo (`LOJISTA/58-...png`): validação inline (máx ≥ mín; obrigatório ⇒ mín ≥ 1) e frase-resumo "O Consumidor escolhe de 1 a 2 opções". Complemento e Adicional seguem conceitos separados do glossário. |
| **CAR-07** | **Depois de criar categoria**, o estado de sucesso oferece "Adicionar item nesta categoria" — em vez do botão dividido "Salvar e criar itens" escondido num menu (`LOJISTA/54-...png`). Foto: arrastar ou escolher, formatos e 5 MiB ditos antes do erro. |
| **CUP-01** | **Lista de Cupons** em tabela: Código · Desconto · Pedido mínimo · Validade · Usos (N de limite) · Status (Ativo/Inativo/Expirado/Esgotado, T-03) · ações. Vazio: "Nenhum Cupom ainda. Crie um código para divulgar." + "Criar Cupom". |
| **CUP-02** | **Formulário numa página** (não 4 passos, `LOJISTA/65`–`70`): código (maiúsculas automáticas, contador, unicidade no servidor), tipo segmentado "R$" / "%", valor, pedido mínimo, validade (data ou "sem validade"), limite total de usos, ativo. |
| **CUP-03** | **Resumo vivo** abaixo do formulário: "10% de desconto em Pedidos a partir de R$ 30,00, até 100 usos, válido até 30/11." É a melhor defesa contra erro de digitação em desconto. |
| **CUP-04** | **Cupom de boas-vindas** como seção própria no topo de `/cupons`: interruptor do programa + valor (R$ ou %), com o texto do que o Consumidor recebe ([45](../../decisoes/45-cupom-conta-e-fidelidade-pos-mvp.md)). |
| **CUP-05** | **Sem sugestões ativáveis em massa.** "Sugestão de cupons inteligentes" + "Ativar todos" (`LOJISTA/64-...png`) não entra; no máximo modelos que **preenchem** o formulário (ver CUP em PERGUNTAS). |
| **REL-01** | **Relatórios numa página:** período com atalhos (Hoje · 7 dias · 30 dias · Mês atual · Personalizado), 3–4 números em `OutlineContainer` (Pedidos, Cancelados, Total vendido, Ticket médio), tabelas por status, Fulfillment e meio de pagamento. GMV com a definição do glossário num `title`/nota. Sem "Meu Desempenho" separado de "Relatório geral" (o Anota tem os dois, vazios). |
| **REL-02** | **Vazio e erro** dos relatórios: "Nenhum Pedido neste período" + atalho para mudar o período; erro com "Tentar de novo" (o print `LOJISTA/105-...png` mostra toast de erro sem saída). |
| **REL-03** | **Plano** (`/plano`, só leitura): Plano (mensal/anual), faixa atual, "N Pedidos este mês" com barra até o limite da faixa e o valor da faixa; nota "A cobrança é feita pela equipe Foode, fora do app". Sem "Contratar", sem FAQ de vendas, sem logos de clientes (`LOJISTA/72-...png`). |
| **REL-04** | **Repasses** (só leitura): tabela de lançamentos com selos Previsto / Em lote / Pago / Débito de Estorno, totais por status, lotes pagos com data; nunca custo do provedor ([61](../../decisoes/61-monetizacao-faixas-taxas-anota.md)). Sem equivalente no Anota (lá é iFood Pago). |
| **EQP-01** | **Equipe:** lista de Operadores com estado "Convite enviado" / "Ativo", "Reenviar convite", "Remover acesso" com confirmação que nomeia a pessoa. |

## 5. Auth (Ticket 22)

| Código | Diretriz |
| --- | --- |
| **AUTH-01** | **Login num passo** (e-mail + senha + Turnstile). O "e-mail primeiro, senha depois" do Anota (`LOJISTA/03-...png`) só se paga com vários métodos de login; aqui é clique a mais. |
| **AUTH-02** | **Sem "Criar minha conta"** nem "Teste grátis": acesso só por convite ([22](../../decisoes/22-auth-lojista-e-consumidor.md), [61](../../decisoes/61-monetizacao-faixas-taxas-anota.md)). Dica sob o e-mail: "Use o e-mail em que você recebeu o convite." |
| **AUTH-03** | **Convite expirado/usado** leva a uma tela que explica e oferece "Pedir novo convite ao Dono" (Operador) ou "Fale com a equipe Foode" (Dono), nunca a um erro genérico. |
| **AUTH-04** | **Erro de login** sem revelar se o e-mail existe; após bloqueio por rate limit, dizer quanto esperar. |

## 6. Ops (Ticket 29 e lotes do 14)

| Código | Diretriz |
| --- | --- |
| **OPS-01** | **Menu próprio** (`foode_ops` só vê `/ops/*`): Lojas · Repasses de hoje · Taxas · Faixas · Custos dos provedores. Uma linha em `ROUTES` por área com `ops.area`. |
| **OPS-02** | **Lista de Lojas** com estado (`onboarding`/`active`/`suspended`, T-03), Plano, faixa do mês e progresso do checklist (ex.: "4 de 6") — o Ops vê o mesmo checklist que o Dono, sem atalho para editar a Loja dele. |
| **OPS-03** | **Cadastro de Loja numa página** com seções (Loja, Endereço, Repasse, Plano e cartão, Dono). Máscaras e dígito verificador de CNPJ; Slug com verificação de disponibilidade enquanto digita. |
| **OPS-04** | **Ações de alto impacto** (suspender Loja, marcar lote pago, nova taxa com vigência) pedem confirmação com o resumo do que muda e quando; taxa futura mostra "vale a partir de DD/MM". |
| **OPS-05** | **Auditoria visível** no detalhe da Loja: quem, quando, antes/depois, em ordem cronológica inversa. |
