# Perguntas ao Dono — o que o Painel do Anota tem e o Foode não espera hoje

**Data:** 2026-11-05 · **Base:** [MAPA-UX-LOJISTA.md](MAPA-UX-LOJISTA.md), [DIRETRIZES-UX-LOJISTA.md](DIRETRIZES-UX-LOJISTA.md), [spec v2](../../../.scratch/mvp-foode-delivery/spec.md) e decisões 13, 23, 27, 35, 38, 41, 42, 45, 58–62.

Cada pergunta traz o print de referência (relativo a esta pasta), a avaliação do padrão, as opções com a **RECOMENDADA** marcada e o porquê em uma linha. Critérios da recomendação: MVP de PME de delivery local, custo de construção e de operação, e o posicionamento da spec (canal próprio enxuto, sem módulos do Anota). Temas já descartados por decisão não têm pergunta: só o registro.

Para responder, basta a letra por código (ex.: `P-OPE-1: A`).

---

## Design system e acessibilidade

**P-DS-1. Como resolver o contraste do primary com texto branco?** (prints: todos os CTAs; código: `apps/admin/src/components/painel-shell.tsx`)
- Avaliação: branco sobre `#F35050` = 3,5:1 e sobre `#E04545` = 4,1:1; ambos reprovam WCAG AA para texto normal (4,5:1). Afeta botões primários, item ativo da navegação e links em primary — no Painel inteiro e no Storefront.
- Opções: **(A) RECOMENDADA** — criar o token `--color-primary-strong` (≈ `#D63A3A`, 4,6:1) para fills com texto e para links, mantendo `#F35050` em bordas, ícones, foco e marca · (B) manter `#F35050` e usar texto ≥ 18,66 px bold em todo fill (AA "texto grande") · (C) aceitar abaixo do AA.
- Porquê: (A) preserva a cor do logo onde ela não carrega texto e resolve o AA com uma linha de CSS em `@foode/ui`.

## Operação da fila de Pedidos (além da spec)

**P-OPE-1. Ter "Aceitar Pedidos automaticamente"?** (`LOJISTA/51-pedidos-kanban-loja-aberta.png`)
- Avaliação: poupa um clique por Pedido em hora de pico; tira a chance de olhar o Pedido antes de produzir. No Anota existe porque "Em análise" expira; o nosso "Recebido" não expira.
- Opções: **(A) RECOMENDADA** — não no MVP; o primeiro clique ("Começar preparo") fica grande e no topo do card · (B) toggle por Loja que move direto para "Em preparo" · (C) só para Pedidos já pagos online.
- Porquê: com ~10 Lojas e volume de PME, o clique é barato e dá controle; dá para medir antes de automatizar.

**P-OPE-2. Busca e filtro por Fulfillment na fila?** (`LOJISTA/51-...png`)
- Avaliação: útil a partir de dezenas de Pedidos simultâneos; com 3 colunas curtas é secundário, e o detalhe já mostra tudo.
- Opções: **(A) RECOMENDADA** — só filtro "Todos / Delivery / Retirada" (chips) no 24; busca fica para os Relatórios · (B) busca por código ou nome na fila · (C) nenhum dos dois.
- Porquê: o chip é barato (filtro no cliente sobre o que o polling já trouxe) e ajuda quem separa entregador de balcão.

**P-OPE-3. Pedir motivo ao cancelar?** (`LOJISTA/21-pedidos-tour-pedido-exemplo.png`, botão X; passo "Cancelar" não capturado)
- Avaliação: motivo alimenta relatório ("cancelados por falta de item") e protege em disputa com o Consumidor; custa uma escolha a mais num momento tenso.
- Opções: **(A) RECOMENDADA** — lista curta opcional (Item em falta · Loja sem condição de atender · Pedido do Consumidor · Endereço fora da área · Outro) gravada no Pedido · (B) obrigatório · (C) sem motivo.
- Porquê: opcional não atrasa o cancelamento e já deixa o dado pronto para o Ticket 14; uma coluna a mais no Ticket 12.

**P-OPE-4. ⚠️ Sinalizado para revisão: o Operador pode ativar a Pausa?** (`LOJISTA/51-...png`, status "Aberto/Fechado" no topo)
- Avaliação: decisões [41](../../decisoes/41-loja-fechada-pause-checkout.md) e [38](../../decisoes/38-rbac-dono-operador-mvp.md) dão a Pausa só ao Dono. Motivo forte para rever: Pausa é **freio de emergência** (cozinha estourada, falta de gás) e quem está no balcão à noite costuma ser o Operador; sem ela, o Consumidor continua pagando PIX por Pedidos que vão ser cancelados com Estorno.
- Opções: **(A) RECOMENDADA** — Operador pode **ativar** a Pausa, só o Dono **retoma**; ação auditada e Dono avisado no Painel · (B) manter só o Dono (decisões 41/38 como estão) · (C) Operador ativa e retoma.
- Porquê: (A) mantém a configuração com o Dono e só abre o freio, que é o lado seguro; se a resposta for (B), nada muda.

**P-OPE-5. "Concluir" em lote na coluna de prontos?** (`LOJISTA/51-...png`, botão "Finalizar")
- Avaliação: acelera o fim do turno; risco de concluir Pedido que ainda não foi entregue.
- Opções: **(A) RECOMENDADA** — não no MVP · (B) "Concluir todos os Prontos para retirada há mais de 2 h" com confirmação.
- Porquê: conclusão é manual por decisão [09](../../decisoes/09-ciclo-pedido-status.md) e o volume do piloto não pede lote.

## Impressão

**P-IMP-1. Impressão automática ao chegar Pedido?** (`LOJISTA/29-pedidos-config-4-impressao.png`)
- Avaliação: muito pedida em cozinha; no navegador exige gesto do usuário ou Chrome em modo quiosque (`--kiosk-printing`), senão abre o diálogo a cada Pedido.
- Opções: **(A) RECOMENDADA** — não; impressão manual 80 mm no detalhe ([62](../../decisoes/62-escopo-ops-multiloja-funcionalidades.md)) + um parágrafo no runbook (Ticket 30) ensinando o modo quiosque para quem quiser · (B) botão "Imprimir ao aceitar" (um clique = muda status e imprime) · (C) app/agent de impressão.
- Porquê: (A) custa zero código; (B) é o próximo passo barato se o piloto reclamar.

**P-IMP-2. Cabeçalho e rodapé personalizáveis no cupom impresso?** (`LOJISTA/42-config-impressora-1-info.png`, que mostra "Mensagem impressão")
- Avaliação: simpático, valor operacional baixo; mais um formulário para manter.
- Opções: **(A) RECOMENDADA** — não; o cupom traz nome da Loja e "Pedido feito em foodedelivery.com.br/loja/{slug}" fixos · (B) dois campos de 40 caracteres em Configurações.
- Porquê: o rodapé fixo já divulga o canal próprio, que é o que importa.

## PDV / balcão

Registro: PDV, frente de caixa, caixas e "+ Novo pedido" manual — **descartados pela decisão [62](../../decisoes/62-escopo-ops-multiloja-funcionalidades.md)** (e spec, Out of Scope). Prints `LOJISTA/45-config-frente-de-caixa.png`, `LOJISTA/74-pdv-balcao.png`, `LOJISTA/104-relatorio-caixas.png`.

**P-PDV-1. Atalho para lançar Pedido de telefone/WhatsApp pelo próprio Storefront?** (`LOJISTA/51-...png`, "+ Novo pedido")
- Avaliação: sem PDV, Pedido que chega por telefone fica fora da fila e da impressão — a cozinha passa a usar dois sistemas. O Storefront já faz tudo isso (Guest com nome e telefone, Pagamento na entrega).
- Opções: **(A) RECOMENDADA** — botão "Lançar Pedido pela Loja" na fila (Dono e Operador) que abre o Storefront da Loja numa aba; nenhum código de PDV · (B) nada; o Pedido externo fica fora · (C) PDV mínimo no Painel (reabre a 62).
- Porquê: (A) resolve 80% do problema com um link; o Pedido conta na faixa como qualquer outro.

## Salão, mesas, garçom e KDS

Registro: Pedidos salão, mesas/comandas, app garçom, QR por mesa, taxa de serviço e KDS — **descartados pelas decisões [27](../../decisoes/27-fora-mvp-tecnico.md) e [62](../../decisoes/62-escopo-ops-multiloja-funcionalidades.md)**. O QR Code **da Loja** (Ticket 28) já cobre "abrir o Cardápio na mesa". Prints `LOJISTA/75`–`77`.

## NFC-e

Registro: relatório, configuração (certificado A1, CSC), categorias tributárias, permissões e inutilização — **descartados pelas decisões 27 e 62**. Prints `LOJISTA/81`–`88`. Sem motivo para rever no MVP (exige certificado e SEFAZ por Loja).

## Cashback e fidelidade

Registro: cashback (4 modos), "Compre + Ganhe" e recuperador de vendas — **descartados pelas decisões [45](../../decisoes/45-cupom-conta-e-fidelidade-pos-mvp.md) e 62**. Prints `LOJISTA/89`–`93`, `LOJISTA/106-relatorio-cashback.png`. Nota de UX para o pós-MVP: o modal "Selecione o modo" com uma opção "Recomendado" é um bom padrão de escolha guiada.

## Robô e notificações por WhatsApp

Registro: robô de atendimento, chamados de atendente, feedback de clientes e envio de cupom pelo robô — **descartados pelas decisões 27 e 62** (só `wa.me`). Prints `LOJISTA/16-onboarding-robo-whatsapp.png`, `LOJISTA/80-robo-configuracoes.png`.

**P-WPP-1. Botão "Avisar no WhatsApp" no detalhe do Pedido, com mensagem pronta por status?** (`LOJISTA/80-robo-configuracoes.png`, mensagens automáticas do robô)
- Avaliação: entrega parte do valor do robô ("seu Pedido saiu para entrega") sem API: `wa.me/<telefone do Consumidor>?text=...` abre o WhatsApp do lojista com o texto pronto; um clique e ele envia. Fica dentro da decisão 27 (só `wa.me`).
- Opções: **(A) RECOMENDADA** — sim, no detalhe do Pedido, texto fixo por status com código e link de acompanhamento · (B) sim, com textos editáveis pelo Dono · (C) não.
- Porquê: custo de um link; resolve a reclamação clássica "o cliente fica ligando para saber do Pedido".

## Cupons além do Ticket 13

**P-CUP-1. Valor máximo do desconto em Cupom percentual?** (`LOJISTA/67-cupons-2-tipo-percentual.png`)
- Avaliação: sem teto, 20% num Pedido de R$ 400 vira R$ 80; o teto é um campo e uma linha na regra do servidor.
- Opções: **(A) RECOMENDADA** — sim, opcional ("Deixe vazio para sem limite") · (B) não.
- Porquê: proteção de margem barata, e o resumo vivo (CUP-03) mostra o efeito.

**P-CUP-2. Cupom de frete (desconto na taxa de Delivery)?** (`LOJISTA/66-cupons-1-preenchido.png`, "Desconto em: Produto / Frete")
- Avaliação: frete grátis é a promoção que mais converte em delivery; **diverge do critério do Ticket 13** ("não incide sobre a taxa de Delivery").
- Opções: **(A) RECOMENDADA** — não no MVP; manter o critério do 13 · (B) tipo "Frete grátis" além de % e R$.
- Porquê: mexe em Delivery, Cupom e Ledger ao mesmo tempo; melhor depois do piloto, com dado.

**P-CUP-3. Cupom válido só em dias da semana escolhidos?** (`LOJISTA/69-cupons-4-disponibilidade.png`)
- Avaliação: bom para "terça fraca"; a validade por data já cobre campanhas.
- Opções: **(A) RECOMENDADA** — não no MVP · (B) sete botões D S T Q Q S S.
- Porquê: mais uma regra de validação e de teste para um uso que o Dono resolve ativando/desativando o Cupom.

**P-CUP-4. Mostrar Cupons ativos no Storefront ("Cupom visível")?** (`LOJISTA/69-...png`, "Cupom visível — Carteira de Promoções")
- Avaliação: vitrine aumenta uso, mas transforma Cupom de divulgação em desconto geral (queima margem com quem compraria de qualquer jeito).
- Opções: **(A) RECOMENDADA** — não; Cupom é código divulgado pelo Dono · (B) interruptor "Mostrar na Loja" por Cupom.
- Porquê: o MVP do 13 é código; a vitrine pertence ao estudo do CLIENTE e ao pós-piloto.

**P-CUP-5. Modelos prontos de Cupom?** (`LOJISTA/64-cupons-lista.png`, "Sugestão de cupons inteligentes" + "Ativar todos")
- Avaliação: tira o lojista da página em branco; "Ativar todos" é anti-padrão (T-08).
- Opções: **(A) RECOMENDADA** — dois ou três modelos que **preenchem** o formulário ("10% acima de R$ 50", "R$ 10 no primeiro Pedido") e o Dono revisa e salva · (B) nenhum modelo · (C) sugestões ativáveis como no Anota.
- Porquê: (A) ajuda sem decidir pelo lojista; custo de três objetos constantes.

## Relatórios avançados

**P-REL-1. Exportar relatório (CSV)?** (`LOJISTA/94-relatorio-pedidos.png`, botão de download)
- Avaliação: contador e planilha do dono pedem; CSV com os filtros aplicados é barato.
- Opções: **(A) RECOMENDADA** — CSV dos Pedidos do período (sem telefone/endereço) no Ticket 14 · (B) não · (C) CSV + XLSX.
- Porquê: evita "me manda a lista" para o Ops; omitir dado pessoal mantém LGPD simples.

**P-REL-2. Itens mais vendidos?** (`LOJISTA/98-relatorio-itens-geral.png`)
- Avaliação: "o que mais vende" é a pergunta nº 1 do dono de restaurante; agregado dos snapshots de linha do Pedido.
- Opções: **(A) RECOMENDADA** — top 10 itens do período (quantidade e total) como mais uma tabela do 14 · (B) com quebra por dia da semana como no Anota · (C) não.
- Porquê: alto valor percebido, uma consulta; a quebra por dia fica para depois.

**P-REL-3. Lista de clientes (ativos/inativos, TOP 10)?** (`LOJISTA/95`–`97`)
- Avaliação: CRM com telefone e nome de Guest; sem robô nem cupom direcionado, vira só uma lista de dado pessoal exposta ao Dono.
- Opções: **(A) RECOMENDADA** — não no MVP · (B) TOP 10 clientes por valor, sem exportação.
- Porquê: base legal e uso ainda não existem; o valor aparece junto com fidelidade (pós-MVP, 45).

**P-REL-4. Funil de conversão do Storefront?** (`LOJISTA/103-relatorio-funil-conversao.png`)
- Avaliação: exige telemetria própria (5 eventos) e armazenamento; o Pixel Meta/Google (Ticket 28) já entrega funil nas ferramentas de anúncio.
- Opções: **(A) RECOMENDADA** — não; apontar no Painel "Veja o funil no Gerenciador de Anúncios/Google" ao lado dos IDs de Pixel · (B) funil próprio.
- Porquê: zero custo e reaproveita o que o 28 já faz.

**P-REL-5. Comparativo com o período anterior nos números do relatório?** (proposta do `LOJISTA/PAINEL.md`, seção 16; print vazio `LOJISTA/79-meu-desempenho-dashboard.png`)
- Avaliação: "+12% vs. semana passada" dá contexto ao número; é a mesma consulta em outro intervalo.
- Opções: **(A) RECOMENDADA** — sim, só nos 3–4 números do topo, com seta + texto (não só cor) · (B) não.
- Porquê: custo baixo e responde "estou melhor ou pior?", que é o motivo de abrir relatório.

## Onboarding e tour

**P-ONB-1. Tour guiado na primeira visita à fila?** (`LOJISTA/19-apos-onboarding.png`–`LOJISTA/24-pedidos-tour-final.png`)
- Avaliação: tours de popover costumam ser pulados e não se repetem; a nossa fila tem 3 colunas e um botão por card.
- Opções: **(A) RECOMENDADA** — sem tour; uma linha de ajuda no estado vazio e o runbook (30) · (B) tour de 3 passos com Pedido fictício.
- Porquê: menos código e menos interrupção; a Loja é acompanhada pelo Ops no onboarding.

**P-ONB-2. Pedido de teste antes de abrir a Loja?** (`LOJISTA/18-onboarding-pedido-teste.png`)
- Avaliação: ver o fluxo de ponta a ponta dá confiança; mas só Loja `active` recebe Pedido e Pedido real conta na faixa (se não cancelado).
- Opções: **(A) RECOMENDADA** — logo após a ativação, Ops e Dono fazem juntos um Pedido real com Pagamento na entrega e o cancelam (cancelado não conta na faixa; sem Estorno); o checklist mostra "Abrir minha Loja" assim que a Loja fica `active` (antes disso o Storefront mostra Cardápio indisponível, pela spec) · (B) modo "Pedido de teste" que não conta na faixa nem cobra.
- Porquê: (A) não cria estado novo no domínio; (B) espalha um flag por Pedido, Ledger e relatórios.

**P-ONB-3. Cardápio inicial gerado por tipo de culinária?** (`LOJISTA/13-onboarding-cardapio-criado.png`, `LOJISTA/14-...png`)
- Avaliação: progresso rápido, mas itens fictícios no Cardápio real são risco de venda errada.
- Opções: **(A) RECOMENDADA** — não; o Cardápio vazio mostra "Comece pela primeira categoria" com exemplo de nomes · (B) semente opcional que o Dono confirma item a item.
- Porquê: lojista do piloto já tem cardápio; o Ops pode ajudar a cadastrar (ver P-CAR-4).

**P-ONB-4. Perguntas de perfil (culinária, objetivo) no primeiro acesso?** (`LOJISTA/09-onboarding-1-culinaria.png`, `LOJISTA/11-onboarding-2-objetivo.png`)
- Avaliação: servem a marketing/segmentação do concorrente; atrasam o Dono que veio configurar.
- Opções: **(A) RECOMENDADA** — não; se o Ops quiser o dado, é um campo no cadastro da Loja (29) · (B) duas perguntas antes do checklist.
- Porquê: quem cadastra a Loja é o Ops, que já conversou com o lojista.

**P-ONB-5. Canal de ajuda dentro do Painel?** (`LOJISTA/51-...png`, botão flutuante de chat)
- Avaliação: suporte acessível reduz abandono no onboarding; widget de chat de terceiro pesa no bundle e cobre a área da fila.
- Opções: **(A) RECOMENDADA** — link "Ajuda" no rodapé do menu que abre `wa.me` do suporte Foode · (B) widget de chat · (C) nada.
- Porquê: zero dependência e o canal que o lojista já usa.

## Configuração da Loja além da spec

**P-CFG-1. Tempo estimado de Delivery e de Retirada?** (`LOJISTA/34-config-estab-4-tempo-entrega.png`; aparece no Storefront como "35 – 55 min" em `LOJISTA/50-cardapio-publico-cliente.png`)
- Avaliação: é das primeiras coisas que o Consumidor procura; dois pares de números por Loja.
- Opções: **(A) RECOMENDADA** — sim, mín/máx em minutos para Delivery e para Retirada, exibidos no Storefront e na confirmação do Pedido · (B) um único tempo · (C) não.
- Porquê: alto valor e custo baixo; candidato natural ao Ticket 24 (Delivery) ou 28 (checklist opcional).

**P-CFG-2. Pedido mínimo para Delivery?** (`LOJISTA/36-config-estab-6-pedido-minimo.png`)
- Avaliação: protege a margem quando a taxa de entrega é baixa; exige mensagem clara no carrinho ("Faltam R$ 8,00 para o pedido mínimo").
- Opções: **(A) RECOMENDADA** — sim, valor único opcional, só para Delivery, recalculado no servidor · (B) não.
- Porquê: lojista de delivery pergunta isso no primeiro dia; regra simples e testável no mesmo lugar do recálculo de Delivery.

**P-CFG-3. Opções do Pagamento na entrega (desligar; troco)?** (`LOJISTA/35-config-estab-5-formas-entrega.png`, "Aceitar apenas pagamento online"; passo 9 não capturado)
- Avaliação: algumas Lojas não querem dinheiro na porta; troco evita viagem perdida do entregador.
- Opções: **(A) RECOMENDADA** — interruptor "Aceitar pagamento na entrega" por Loja (padrão ligado) + campo opcional "Troco para" no checkout quando o Consumidor escolhe pagar na entrega · (B) só o interruptor · (C) nenhum.
- Porquê: dois campos, ambos visíveis no Pedido impresso; o troco cruza com a análise do CLIENTE.

**P-CFG-4. Autopreencher endereço pelo CEP no cadastro de Loja (Ops)?** (`LOJISTA/32-config-estab-2-endereco-preenchido.png`)
- Avaliação: poupa digitação e erro de grafia; depende de serviço externo (ViaCEP/BrasilAPI) chamado do navegador.
- Opções: **(A) RECOMENDADA** — sim, opcional no formulário do Ops (29), campos sempre editáveis e falha silenciosa · (B) não.
- Porquê: só o Ops usa, poucas vezes; se o serviço cair, digita-se como hoje.

**P-CFG-5. Desativar um bairro sem apagar?** (`LOJISTA/37-config-estab-7-regioes-atendimento.png`, coluna Status)
- Avaliação: útil quando o entregador falta numa região; apagar e recriar perde o valor da taxa.
- Opções: **(A) RECOMENDADA** — sim, interruptor por bairro (bairro inativo = fora da área no checkout) · (B) não; remover e recriar.
- Porquê: uma coluna booleana no Ticket 24, e o Storefront já sabe tratar "bairro não atendido".

## Cardápio avançado

**P-CAR-1. Grupos de Complemento/Adicional reutilizáveis entre itens?** (`LOJISTA/60-cardapio-item-adicionais-salvo.png`, "Grupos de Adicionais já existentes")
- Avaliação: "Ponto da carne" em 10 hambúrgueres = 10 cadastros iguais hoje; reuso economiza muito, mas muda o modelo (grupo da Loja ligado a N itens) e a semântica de edição ("muda em todos?").
- Opções: **(A) RECOMENDADA** — não no MVP; oferecer "Copiar grupos de outro item" no 23 · (B) grupos reutilizáveis de verdade · (C) nada.
- Porquê: copiar resolve o cadastro inicial sem mexer no schema que o Ticket 23 está portando.

**P-CAR-2. Categoria "Pizza" (tamanhos, sabores, meio a meio)?** (`LOJISTA/53-cardapio-nova-categoria-form.png`, Modelo "Pizza")
- Avaliação: essencial para pizzaria (fatia grande do ICP de delivery); exige regra de preço por fração e UI própria no Storefront.
- Opções: **(A) RECOMENDADA** — não no MVP; pizzaria modela tamanho como Complemento obrigatório e sabor único · (B) meio a meio com preço do sabor mais caro · (C) meio a meio com preço médio.
- Porquê: [13](../../decisoes/13-cardapio-mvp.md) fecha o Cardápio em Complementos/Adicionais; meio a meio é o primeiro candidato pós-piloto se houver pizzaria.

**P-CAR-3. Classificações do item (vegetariano, vegano, sem glúten, zero lactose)?** (`LOJISTA/61-cardapio-item-3-classificacoes.png`)
- Avaliação: ajuda parte do público a filtrar; responsabilidade legal fica com o lojista (o Anota exibe aviso).
- Opções: **(A) RECOMENDADA** — não no MVP · (B) até 6 selos fixos por item, exibidos no Storefront com o aviso de responsabilidade.
- Porquê: valor de nicho; a descrição do item já permite escrever "vegano".

**P-CAR-4. Cadastro assistido do Cardápio (lojista envia foto, Foode cadastra)?** (`LOJISTA/52-cardapio-gestor.png`, banner "Enviar cardápio")
- Avaliação: o maior atrito do onboarding é digitar o cardápio; aqui é serviço, não feature.
- Opções: **(A) RECOMENDADA** — sim como **serviço do Ops** (fora do app): o Ops entra como Dono convidado temporário ou o Dono envia por WhatsApp; nenhum código · (B) importação por foto/IA no Painel · (C) não oferecer.
- Porquê: com ~10 Lojas, gente resolve melhor e mais barato que importador.

**P-CAR-5. Edição de preços em massa?** (`LOJISTA/51-...png`, menu "Edição em massa")
- Avaliação: reajuste anual de 60 itens um a um é doloroso; mas preço inline (CAR-03) já reduz muito.
- Opções: **(A) RECOMENDADA** — não no MVP; preço inline com Enter por linha · (B) reajuste % por categoria com prévia.
- Porquê: inline cobre o caso com o que o 23 já vai construir.

## Identidade da Loja no Storefront (Cardápio digital)

**P-VIS-1. Logo da Loja no Storefront?** (`LOJISTA/48-cardapio-digital-2-cor-capa.png`, `LOJISTA/50-cardapio-publico-cliente.png`)
- Avaliação: "canal próprio" sem a marca da Loja parece marketplace; upload já existe no R2.
- Opções: **(A) RECOMENDADA** — sim, logo quadrado (mesmas regras de imagem do Cardápio), no Ticket 28 junto dos dados de contato · (B) não no MVP.
- Porquê: maior ganho de percepção por menor custo; reaproveita o fluxo de upload do 23.

**P-VIS-2. Cor e imagem de capa personalizadas?** (`LOJISTA/48-...png`)
- Avaliação: cor livre quebra contraste (P-DS-1) e a identidade Foode; capa pede cuidado de recorte em celular.
- Opções: **(A) RECOMENDADA** — nenhuma das duas no MVP · (B) só capa · (C) capa + cor com verificação automática de contraste.
- Porquê: o logo (P-VIS-1) entrega identidade sem risco de tela ilegível.

**P-VIS-3. Descrição da Loja e itens em destaque?** (`LOJISTA/49-cardapio-digital-7-link.png`, passos 3 e 4 do stepper)
- Avaliação: destaque ajuda a vender o carro-chefe; descrição curta ajuda SEO e compartilhamento.
- Opções: **(A) RECOMENDADA** — só descrição curta (até 160 caracteres) no 28 · (B) descrição + até 4 itens em destaque · (C) nenhum.
- Porquê: a descrição serve também de meta description do link compartilhado; destaque fica para o estudo do CLIENTE.

## Plano e assinatura

Registro: teste grátis, contratação self-serve, faixa promocional "R$ 270 OFF" e FAQ de vendas — **descartados pelas decisões [35](../../decisoes/35-ui-billing-plano-painel.md) e [61](../../decisoes/61-monetizacao-faixas-taxas-anota.md)**. Prints `LOJISTA/02-planos.png`, `LOJISTA/72-planos.png`, `LOJISTA/73-planos-rodape.png`.

**P-PLN-1. Avisar o Dono quando estiver perto de mudar de faixa?** (`LOJISTA/72-planos.png`)
- Avaliação: transparência evita surpresa na cobrança; alerta chamativo pode soar como punição por vender mais.
- Opções: **(A) RECOMENDADA** — só na tela Plano: "128 de 150 Pedidos este mês · faixa até 150" com barra; sem alerta fora dela · (B) aviso no topo do Painel a partir de 90% · (C) nada.
- Porquê: informa sem criar ansiedade na fila; a cobrança é humana e o Ops conversa antes.

## Integrações

Registro: chave/token de integração, catálogo de integrações, iFood (pedidos e clonagem de cardápio) — **descartados pela decisão 27** (iFood) e **62**. Print `LOJISTA/46-config-integracoes.png`. Nota de segurança para o futuro: o Anota exibe o token em claro com "copiar"; se um dia houver, mostrar mascarado, copiar uma vez e permitir rotação.

## Outros módulos do menu

Registro: Pedidos agendados (**decisões 13 e 41**), Entregadores/frota (**decisão 42** e spec), KDS (**27/62**), Recuperador de vendas e Compre + Ganhe (**62**), Satisfação/NPS (fora da spec; não perguntado — só faz sentido junto de base de clientes, P-REL-3).
