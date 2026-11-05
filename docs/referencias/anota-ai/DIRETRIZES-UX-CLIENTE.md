# Diretrizes de UX — compra do Consumidor no Storefront

**Data:** 2026-11-05 · **Fonte:** prints e `FLUXO.md` em [`CLIENTE/`](CLIENTE/) (Anota.ai, loja de referência, mobile 414 px) · **Mapa detalhado:** [MAPA-UX-CLIENTE.md](MAPA-UX-CLIENTE.md) · **Pendências do Dono:** [PERGUNTAS-CLIENTE.md](PERGUNTAS-CLIENTE.md)

## Como ler

- O concorrente é **referência de fluxo**, não de verdade. Cada diretriz passou por heurísticas de Nielsen, pesquisa de checkout da Baymard, WCAG 2.2 AA e fricção/conversão no celular. O que é anti-padrão está em [§ Anti-padrões](#anti-padrões-vistos-nos-prints-não-repetir).
- **Identidade é Foode:** primary `#F35050`, accent `#FFB800` (raro), Nunito, containers outline (borda 1 px `--color-hairline`, sem fill, **sem sombra**), cantos arredondados ([FOODE-BRAND](../../FOODE-BRAND.md), [ADR 0005](../../adr/0005-brand-foode-outline-taste-skill.md)). Nada do verde, das ilustrações (sacola com confete), dos ícones nem da copy de marca do concorrente.
- **Componentes:** `@foode/ui` — `Button`, `OutlineContainer`, `Card`, `Badge` (`primary|accent|success|error|neutral`), `Price` (`strike`), `formatCentsBRL`, `Field` (liga `aria-invalid`/`aria-describedby` e erro com `role="alert"`), `Input`, `Textarea`, `Select`, `Radio`, `Checkbox` (branch `origin/feat/23-pre-391f`). Mensagens de erro vêm de mapas PT-BR em `@foode/shared` (padrão `cartLineErrorMessagePt`).
- Diretrizes que dependem de pergunta aberta estão marcadas **[depende de P-x.y]**. Escopo e decisões fechadas não mudam por este documento.

## Princípios gerais (valem em todas as telas)

- **G1 · Uma ação primária por tela, fixa no rodapé.** `Button` primary de largura total, `position: sticky` com `padding-bottom: env(safe-area-inset-bottom)`, altura ≥ 48 px. Rótulo = próxima ação + valor quando houver dinheiro: "Adicionar · R$ 59,98", "Continuar · R$ 113,78", "Fazer pedido · R$ 170,58".
- **G2 · CTA que explica o que falta, sem botão morto.** Quando falta algo, o rótulo diz o quê ("Escolha o sabor", "Escolha como receber", "Escolha como pagar"), mas o botão continua focável (`aria-disabled="true"`, não `disabled`): ao tocar, rola até a primeira pendência, foca nela e anuncia a mensagem em `role="alert"`. O concorrente usa botão cinza `disabled`, que leitores de tela pulam e que não diz ao usuário onde agir (Nielsen #1 e #9).
- **G3 · Carregamento no lugar da ação.** Spinner dentro do botão + `aria-busy`, texto "Enviando…"/"Aplicando…". Proibido overlay de tela cheia ou modal só de loading para operações curtas (prints 17, 25, 33). Overlay só no envio do Pedido/pagamento, que é irreversível, e mesmo assim sem esconder o resumo.
- **G4 · Um erro, um lugar.** Erro de campo inline abaixo do campo via `Field` (borda `--color-error` + texto + ícone, não só cor). Erro de envio acima do CTA, com foco programático. Nunca toast **e** inline para o mesmo erro (print 33). Toast (`role="status"`) só para confirmação positiva efêmera.
- **G5 · Contraste.** `#F35050` sobre branco dá ~3,5:1 (abaixo de 4,5:1). Rótulo de botão primary em ≥ 18,66 px bold (critério de texto grande, 3:1) ou ≥ 24 px regular; texto pequeno e preços em `--color-ink`; primary só em elementos grandes ou ícones com rótulo. Foco visível em todo controle.
- **G6 · Toque e teclado.** Alvos ≥ 44×44 px (contadores −/+ inclusos); `inputmode`/`autocomplete` corretos; ordem de foco = ordem visual; sheets e diálogos com foco preso, `Esc` fecha e o foco volta ao gatilho.
- **G7 · Dinheiro.** Sempre de centavos via `formatCentsBRL`/`Price`. Total recalculado na hora no cliente (mesmo módulo `menu/cart.ts`), com o servidor como fonte de verdade: se o total do servidor divergir, mostrar o novo total e pedir confirmação antes de enviar.
- **G8 · Movimento.** Sem confete nem animação decorativa. Rolagem automática só curta e respeitando `prefers-reduced-motion`.
- **G9 · Estados.** Toda lista e todo bloco têm os estados *carregando* (skeleton outline com as mesmas dimensões), *vazio* (frase + ação) e *erro* (frase + "Tentar de novo"), com copy definida no ticket.
- **G10 · Dados pessoais.** Pedir só o necessário no momento em que é necessário (decisões [43](../../decisoes/43-guest-conta-vinculo-pedido.md) e [60](../../decisoes/60-pagamentos-efi-abacatepay.md)); dizer para que serve em uma linha; nunca preencher dados de terceiros a partir de um telefone digitado.

## 1. Cardápio (home da Loja) — Ticket 23 (+ 24 para estado de funcionamento)

- **C1 · Cabeçalho compacto.** Logo/nome da Loja, linha de estado ("Aberta até 23:00" · "Fechada — abre amanhã às 18:00" · "Em pausa — pedidos voltam em breve") e link "Sobre a Loja". O estado é texto + ícone, não um card grande (o atual `StoreOperationStatus` ocupa a primeira dobra). Bloqueio de checkout por horário/Pausa segue a [41](../../decisoes/41-loja-fechada-pause-checkout.md).
- **C2 · Navegação por categoria.** Abas horizontais roláveis e *sticky* com scroll-spy (aba ativa sublinhada em primary, `aria-current="true"`), implementadas como `nav` com links-âncora para as seções. O botão "Categorias" abre um sheet com a lista completa (atalho para cardápios longos). Adotar.
- **C3 · Card de item.** `Card` outline: nome (bold, ink), descrição em até 2 linhas, preço com `Price`, foto 1:1 à direita (ou placeholder neutro Foode; nunca espaço vazio). Card inteiro é o alvo de toque; o item indisponível aparece esmaecido com `Badge neutral` "Indisponível" e não abre (se o contrato público entregar `available: false`).
- **C4 · Busca no Cardápio [depende de P-1.4].** Campo com rótulo visível, filtro no cliente enquanto digita (debounce ~150 ms), botão limpar com `aria-label="Limpar busca"`, contagem anunciada em `aria-live` ("3 itens encontrados") e vazio "Nenhum item com “x”. Veja todas as categorias".
- **C5 · Estados.** Cardápio vazio: "Cardápio em preparação" (já existe). Erro de carga: "Não conseguimos abrir o Cardápio agora." + "Tentar de novo". Loja `onboarding`/`suspended`: "Cardápio indisponível" (spec).
- **C6 · "Sobre a Loja" [depende de P-5.1].** Sheet com horários da semana, endereço (para Retirada) e meios de pagamento aceitos — derivados de dados que já existem (horários do 24, meios com taxa vigente do 26/27).

## 2. Item e Complementos — Ticket 23

- **I1 · Item em sheet/página com URL própria** (ex.: `?item=<id>`): o botão Voltar do celular fecha o item em vez de sair da Loja, o link é compartilhável e o Pixel `view_item` (Ticket 28) tem um momento claro.
- **I2 · Todos os grupos numa rolagem só, sem "etapas" que trocam de tela.** Cada grupo é um `fieldset` com `legend` = nome do grupo, instrução derivada de `minSelect`/`maxSelect` ("Escolha 1", "Escolha até 2", "Escolha de 1 a 3"), `Badge` "Obrigatório" quando `minSelect ≥ 1` e contador "0/1" atualizado em `aria-live="polite"`. `Radio` quando `maxSelect = 1`; `Checkbox` quando > 1, desabilitando as opções restantes ao atingir o máximo (com o motivo no contador). Ao completar um grupo obrigatório de escolha única, rolar até o próximo grupo pendente — sem trocar de tela (o auto-avanço do concorrente esconde o que já foi escolhido e quebra a reversão, Nielsen #3).
- **I3 · Adicionais** num grupo próprio "Adicionais" com `Checkbox` e "+ R$ 9,90" alinhado à direita.
- **I4 · Filtro dentro do item** só quando um grupo tiver ≥ 10 opções (pizzarias com muitos sabores); fora disso é ruído.
- **I5 · Quantidade e total.** Contador −/+ (1 a 99, `MAX_LINE_QUANTITY`) com `aria-label="Diminuir quantidade"`/"Aumentar quantidade" e o número em `aria-live`; − desabilitado em 1. CTA "Adicionar · R$ total" (G1/G2) com rótulo "Escolha {grupo}" enquanto faltar obrigatório.
- **I6 · Observação do item [depende de P-1.5].** `Textarea` opcional "Alguma observação?" com placeholder "Ex.: sem cebola" e contador de caracteres.
- **I7 · Depois de adicionar:** fechar o item, voltar ao Cardápio **na mesma posição**, toast `role="status"` "Pizza Calabresa adicionada" com ação "Ver carrinho", e a barra do carrinho (K1) atualiza. Sem modal bloqueante (print 07): interromper quem quer continuar comprando custa um toque a mais em todo item (Baymard: confirmações modais pós-adição reduzem a continuidade de navegação).
- **I8 · Erros da linha** com as mensagens de `cartLineErrorMessagePt` inline no grupo afetado (ex.: `complement_too_few` no fieldset correspondente).

## 3. Carrinho — Tickets 23 (estado) e 20.2 (módulo)

- **K1 · Barra do carrinho** fixa, só com itens: "Ver carrinho · 2 itens · R$ 113,78" (subtotal; sem a palavra "Total" para não prometer o valor final antes da entrega). Não usar barra inferior de abas (P-5.2).
- **K2 · Linha do carrinho.** "2× Pizza Broto", escolhas agrupadas por Complemento ("Sabor: Marguerita", "Borda: Catupiry +R$ 9,90"), observação se houver, subtotal da linha em ink. Ações: "Editar" (texto, não só lápis; reabre o item com as escolhas preenchidas e substitui a linha) e contador −/+ em que o − vira "Remover" (ícone de lixeira **com** `aria-label="Remover Pizza Broto"`) em 1. Remoção com "Desfazer" no toast por 5 s em vez de diálogo de confirmação.
- **K3 · Preço riscado** só se houver promoção modelada e sempre na **mesma base** da linha (o print 14 risca o preço unitário ao lado do total de 2 unidades — anti-padrão).
- **K4 · Linha inválida** (item saiu, indisponível, Complemento mudou) destacada na própria linha com a mensagem do mapa PT-BR e ações "Editar"/"Remover"; bloqueia o avanço (G2).
- **K5 · Carrinho de outra Loja** (`assertSingleStore`): aviso com "Esvaziar e começar aqui" — já coberto.
- **K6 · Vazio:** "Seu carrinho está vazio." + "Ver Cardápio". Link "Adicionar mais itens" sempre visível abaixo da lista.
- **K7 · Pedido mínimo [depende de P-2.5]:** se aprovado, faixa no carrinho "Faltam R$ 6,00 para o pedido mínimo de R$ 24,00" e CTA com esse rótulo (G2).

## 4. Finalizar pedido — Tickets 24 (Fulfillment, dados, envio), 26/27 (pagamento), 13 (Cupom)

- **X1 · Uma tela só, em seções, nesta ordem:** Seus dados → Como receber → Endereço (Delivery) → Pagamento → Cupom → Observações → Resumo → CTA. Seção concluída vira linha-resumo com "Alterar". O concorrente usa 4 rotas + 2 modais (identificação, modal de confirmação, endereço em tela própria, cupom em tela própria): cada troca de tela é um ponto de abandono, e a Baymard mostra que checkout curto e linear converte melhor que "wizard" com idas e voltas. Sem modal "Confirme seus dados" (print 19): os dados já estão visíveis na própria seção.
- **X2 · Seus dados.** `Field` "WhatsApp" (`type="tel"`, `inputmode="tel"`, `autocomplete="tel-national"`, máscara "(11) 91234-5678" que aceita colar com +55/espaços, validação de DDD + 8/9 dígitos ao sair do campo via `phone-br.ts`) e "Nome e sobrenome" (`autocomplete="name"`). Hint: "Usamos só para preparar e entregar este pedido." Sem e-mail ([43](../../decisoes/43-guest-conta-vinculo-pedido.md)). **Sem lookup de cliente pelo telefone no servidor** (P-2.1). Lembrar no aparelho [depende de P-2.2].
- **X3 · Como receber.** Dois `Radio` em cards outline ("Delivery · taxa conforme o bairro" / "Retirada na Loja · grátis") só quando os dois estão ativos; com um só, texto fixo sem escolha. Previsão de tempo ao lado de cada opção [depende de P-2.4].
- **X4 · Endereço.** Campos na própria seção: Rua; Número com `Checkbox` "Sem número" (UI que concatena em `streetLine`, sem mudar o snapshot do [Ticket 09](../../../.scratch/mvp-foode-delivery/issues/09-delivery-taxa-fixa-bairro.md)); Bairro; Complemento ("Casa, apto, bloco…"); Ponto de referência. No modo **bairro**, Bairro é `Select` (com filtro se > 15) da lista atendida mostrando a taxa ("Centro · R$ 5,00"), e abaixo "Seu bairro não está na lista? Ainda não entregamos aí." + atalho para Retirada se ativa ([42](../../decisoes/42-taxa-delivery-bairro-ou-fixa.md)). No modo **taxa fixa**, Bairro é texto livre e a taxa aparece no resumo. Sem CEP/geolocalização no MVP (P-3.1, P-3.2). Salvar endereço é local à sessão do checkout — nada de tela "Salvando seu endereço…".
- **X5 · Pagamento.** Grupos "Pagar agora" (PIX; Cartão de crédito — só meios com taxa Foode vigente, [61](../../decisoes/61-monetizacao-faixas-taxas-anota.md)) e "Pagar na entrega", ambos visíveis (sem acordeão escondendo opção — o acordeão fechado do print 26 esconde o meio mais usado por PME). Cada opção é `Radio` em linha outline com ícone genérico e descrição curta ("Aprovação na hora" no PIX). Ao escolher Cartão, o formulário do Ticket 27 abre **inline** com CPF, e-mail (e nascimento na Efí) — só nesse meio ([60](../../decisoes/60-pagamentos-efi-abacatepay.md)). Sem carteiras/logos de terceiros que não aceitamos. Subtipo e troco na entrega [depende de P-4.1, P-4.2].
- **X6 · Resumo** em `OutlineContainer`: Subtotal, Taxa de entrega (ou "Retirada · grátis"), Desconto do cupom em linha própria ("Cupom BEMVINDO −R$ 10,00"), **Total**. Atualiza ao trocar bairro, Fulfillment ou Cupom, com o total em `aria-live`.
- **X7 · Envio.** CTA "Fazer pedido · R$ total". Ao tocar: `aria-busy`, botão bloqueado contra duplo toque, mesma chave de idempotência em qualquer retry (Ticket 24). Erros do servidor mapeados (`checkoutErrorMessage`) acima do CTA, com foco; carrinho e formulário preservados. Pausa/fechamento entre carrinho e envio: "A Loja pausou os pedidos agora. Seu carrinho foi mantido." ([41](../../decisoes/41-loja-fechada-pause-checkout.md)).
- **X8 · Observações do Pedido [depende de P-2.3].** `Textarea` recolhido em "Adicionar observação" (placeholder "Ex.: apertar a campainha"), com contador.
- **X9 · Texto legal [depende de P-6.1]** em corpo pequeno (ink, ≥ 4,5:1) logo acima do CTA.

## 5. Cupom — Ticket 13

- **U1 · Inline no checkout**, não em rota própria: linha "Tem um cupom?" que expande `Input` + `Button` secondary "Aplicar". Normaliza para maiúsculas e sem espaços enquanto digita (`autocapitalize="characters"`, `autocomplete="off"`, `spellcheck="false"`).
- **U2 · Validação** com spinner no próprio botão (G3). Sucesso: chip `Badge success` "BEMVINDO aplicado · −R$ 10,00" + "Remover", e linha no resumo (X6). Erro **só inline** (G4), com mensagem específica por código do servidor, por exemplo: "Cupom não encontrado." · "Este cupom expirou." · "Este cupom não está ativo." · "Faltam R$ 12,00 para usar este cupom (pedido mínimo R$ 50,00)." · "Este cupom atingiu o limite de usos." · "Só um cupom por pedido." O genérico do concorrente ("Não foi possível inserir esse cupom." + "inexistente ou expirado") não diz como resolver (Nielsen #9).
- **U3 · Microcopy de regra:** "O desconto não vale para a taxa de entrega." visível quando o Cupom estiver aplicado num Delivery.
- **U4 · Revalidação no envio:** se o Cupom perdeu validade entre aplicar e enviar, mostrar o novo total e pedir confirmação (G7).

## 6. Pós-pedido — Tickets 24, 26, 27, 13 (sem prints: só o que a spec define)

O concorrente não foi capturado depois de "Fazer pedido". Valem a spec e os tickets, com G1–G10:

- Página do Pedido por token: status em linguagem do Consumidor (`orderStatusLabelPt`), resumo, `wa.me` "Falar com a Loja" (decisão [07](../../decisoes/07-canal-consumidor-web-mobile-first.md)), atualização periódica com o status em `aria-live`.
- **PIX (26):** QR + copia-e-cola com botão "Copiar código" (feedback "Código copiado" em `role="status"`), valor e expiração visíveis, 3 passos curtos, troca automática para "Pagamento confirmado".
- **Cartão (27):** estados aprovado / pendente / recusado distintos, com ação clara no recusado ("Tentar outro cartão" ou "Pagar com PIX").
- **Criar conta (13):** oferta pós-pedido, opcional, com o Cupom de boas-vindas só se o programa estiver ativo.
- **Pixel (28):** `view_item` ao abrir o item (I1), `add_to_cart` ao confirmar "Adicionar" (I7), `purchase` na confirmação do Pedido/pagamento, só valor e moeda.

## Painel do Dono e do Operador

Este pacote (`CLIENTE/`) **não tem prints do Painel**. Os prints do lojista estão em [`LOJISTA/`](LOJISTA/) e serão analisados em documento próprio. Até lá vale só o que a spec já define, sem acréscimos: fila por polling de 10 s com som único por Pedido novo, detalhe com itens, escolhas, Fulfillment e pagamento, transições válidas e conclusão manual, impressão 80 mm (Ticket 24), cancelamento com Estorno (12), Cupons (13), checklist/Slug/QR/Pixel (28), Plano/Repasses (14) e `/ops` (29). Única consequência do fluxo do Consumidor para o Painel: **se** P-1.5, P-2.3, P-4.1 ou P-4.2 forem aprovadas, observações, subtipo de pagamento na entrega e troco precisam aparecer no detalhe do Pedido e no cupom 80 mm.

## Anti-padrões vistos nos prints (não repetir)

| Print | Anti-padrão | Por quê | Nós |
| --- | --- | --- | --- |
| 17 | Lookup de cliente pelo telefone sem verificação | Expõe nome/endereço de terceiros a quem digitar um número (LGPD; contraria a [43](../../decisoes/43-guest-conta-vinculo-pedido.md)) | X2, P-2.1 |
| 17, 25, 33 | Modal/tela cheia só para loading | Bloqueia a tela, esconde contexto, não acessível | G3 |
| 33–34 | Toast **e** erro inline para o mesmo erro, ambos genéricos | Redundante e não diz como corrigir | G4, U2 |
| 11, 16, 20, 26 | Botão cinza `disabled` como única pista | Leitor de tela pula; usuário não sabe onde agir | G2 |
| 07 | Modal de "adicionado" com confete | Interrompe quem continua comprando | I7 |
| 19 | Modal "Confirme seus dados" ao entrar no checkout | Etapa redundante (os dados já estão na tela) | X1 |
| 12 | Auto-avanço de etapa ao escolher | Esconde a escolha feita, dificulta corrigir | I2 |
| 14 | Preço riscado unitário ao lado do total da linha | Comparação em bases diferentes engana | K3 |
| 26 | Acordeão "Pagar na entrega" fechado | Esconde opção relevante atrás de um toque | X5 |
| 26 | Seis carteiras/logos de terceiros | Ruído e dependência de marca alheia; fora do escopo ([60](../../decisoes/60-pagamentos-efi-abacatepay.md)) | X5, P-4.5 |
| 30 | Atalho "Pagar com Pix" dentro do modal de troco | Mistura decisões e distrai no meio de uma tarefa | P-4.4 |
| 30 | Placeholder "R$ 50,00" menor que o total (R$ 170,58) | Exemplo inválido sugere valor errado | P-4.2 |
| 22 | Faixa vermelha "ative o localizador" | Cor de erro para um convite; ruído | X4 |
| 16 | Labels em forma de pergunta ("Seu número de WhatsApp é:") e placeholder como rótulo no nome | Rótulo curto e sempre visível é mais claro | X2 |
