# Mapa de UX do Painel do lojista — Anota AI × Foode

**Data:** 2026-11-05 · **Fonte:** `LOJISTA/PAINEL.md` + ~105 prints `LOJISTA/*.png` (caminhos relativos a esta pasta) · **Base do código:** `apps/admin` na branch `feat/22-auth-rbac-391f`.
**Diretrizes citadas (códigos):** [DIRETRIZES-UX-LOJISTA.md](DIRETRIZES-UX-LOJISTA.md) · **Perguntas abertas:** [PERGUNTAS-LOJISTA.md](PERGUNTAS-LOJISTA.md)

## Como ler

Cada tela ou grupo tem uma tabela: **padrão do concorrente (print)** → **o que temos no código** → **ticket** → **diretriz** → **avaliação de UX** → **classificação**.

Classificações:
- **adotar no ticket X**: entra como está, no visual Foode.
- **adotar adaptado no ticket X**: entra com a mudança descrita.
- **já coberto**: o ticket ou o código já fazem isso.
- **FORA DO ESCOPO — decidir**: não está na spec nem nas decisões; a pergunta está em PERGUNTAS.
- **fora do escopo por decisão N**: descartado por decisão fechada; não se pergunta.

### O que o Painel tem hoje (`apps/admin`)

- **Rotas montadas:** `(auth)` `/entrar`, `/esqueci-senha`, `/definir-senha` (Turnstile, `Field`/`Notice`); `(sessao)` `/selecionar-loja`, `/sem-acesso`; `(painel)` `/` (placeholder "Nenhum Pedido em andamento.") e `/ops` (placeholder).
- **Navegação:** `lib/access.ts` → `ROUTES` (`/` Pedidos, `/cardapio`, `/configuracoes`, `/equipe`, `/ops`, `/selecionar-loja`), filtradas por `can()` de `@foode/shared/auth`. `PainelShell`: sidebar ≥ 768 px, faixa horizontal no celular, item ativo em pill primary, `StoreSwitcher` com mais de uma Loja, nome e papel no rodapé.
- **Componentes da stack antiga, ainda não montados (referência para 23/24):** `orders/orders-queue.tsx` (polling 10 s, som único, detalhe, transições válidas), `operation/operation-panel.tsx` (horários por dia + Pausa), `delivery/delivery-panel.tsx` (Retirada, modo de taxa, bairros), `menu/*` (categorias, itens, foto, Complementos, Adicionais, ordem), `team/team-panel.tsx` (convite/remoção de Operador). Feedback por querystring (achado 20.5).
- **`@foode/ui`:** `Button` (primary/secondary, `asChild`), `OutlineContainer`, `BrandMark`.
- **Papéis:** Dono = `store.settings`, `store.members`, `store.menu`, `orders.*`; Operador = `orders.*`; Ops = `ops.area`.

---

## 0. Moldura global (topo, menu lateral, toasts)

Prints: `LOJISTA/51-pedidos-kanban-loja-aberta.png`, `LOJISTA/33-config-estab-3-horarios.png`, `LOJISTA/74-pdv-balcao.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação de UX | Classificação |
| --- | --- | --- | --- | --- | --- |
| Faixa amarela "Até R$ 270 OFF… Finaliza em 7 dias" + "Garantir desconto"; "Ative o cashback!" no topo | — | — | T-08 | Dark pattern de urgência falsa no espaço mais nobre da ferramenta de trabalho; compete com Pedidos. | **não adotar** (T-08) |
| Ícones de status no topo: Loja Aberto/Fechado, robô Conectado/Desconectado, sino com contador | Nome da Loja no shell, sem status | 24, 28 | NAV-04 | Visibilidade do estado do sistema (Nielsen #1) é ótima; ícones sem rótulo e o robô são ruído. | **adotar adaptado no 24** (selo com texto; Pausa só Dono) |
| Menu lateral com ~60 entradas em 7 grupos, submenus, badges "NOVO"/"Grátis", busca "Procurando por algo?" | 4 itens por papel em `ROUTES` | 13, 14, 22 | NAV-01, NAV-02, NAV-03 | Carga cognitiva alta; a busca existe porque o menu não cabe na memória. | **adotar adaptado** (≤ 8 itens em 3 grupos; Operador sem sidebar) |
| Card "Você está no teste grátis! 1/6 dias" + "Ver Planos"; alerta vermelho "Finalize seu cadastro"; "Baixe o Anota AI — Você pode estar limitado!" | — | — | T-08, ONB-01 | Três chamadas concorrentes de cor forte; a última é medo sem informação. | **não adotar**; trial **fora do escopo por decisão 61** |
| Card do usuário no rodapé (Loja, nome, selo "ABERTO") | Nome + papel + Sair no rodapé | 22 | NAV-04, NAV-08 | Bom para multi-Loja: lembra em qual Loja se está. | **já coberto** (acrescentar selo de status no 24) |
| Botão flutuante de chat de suporte | — | — | — | Útil num SaaS com suporte humano; cobre o canto onde ficam toasts e botões da fila. | **FORA DO ESCOPO — decidir** (ver P-ONB-5 em PERGUNTAS) |
| Páginas de configuração: título + breadcrumb + stepper vertical numerado + rodapé fixo "Salvar Alterações" | `/configuracoes` sem conteúdo | 24, 28 | T-07, NAV-05, NAV-06 | Rodapé fixo de salvar é bom; numeração sugere ordem inexistente; breadcrumb no 1º nível é ruído. | **adotar adaptado no 24/28** |
| Toasts no canto superior direito, verde genérico "Prontinho! Operação realizada com sucesso." | `Notice` inline (auth); querystring nos painéis antigos | 20, 24 | T-05 | Toast genérico não confirma *o quê*; fica longe da ação. | **adotar adaptado** (inline em formulário; toast específico na fila) |

## 1. Site comercial e planos

Prints: `LOJISTA/01-site-home.png`, `LOJISTA/02-planos.png`, `LOJISTA/72-planos.png`, `LOJISTA/73-planos-rodape.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Home com formulário de teste grátis (7 campos, inclui faturamento e "possui computador") | — | — | — | Qualificação de lead para vendas; não é Painel. | **fora do escopo por decisão 40** (marketing no `web`) e **61** (sem trial) |
| Planos: anual com preço "de" riscado, mensal por faixa de pedidos, "Você começa aqui" | Faixas no `/ops` (29); tela Plano no 14 | 14, 29 | REL-03 | Preço por faixa é claro; "de/por" riscado e prova social são técnicas de venda. | Faixas: **já coberto** (61). Tela de vendas: **não adotar** |
| Página Planos no Painel com FAQ, logos de clientes e "Contratar plano mensal" | — | 14 | REL-03 | No nosso modelo a cobrança é fora do app; botão "Contratar" seria um beco sem saída. | **adotar adaptado no 14** (só leitura) |

## 2. Cadastro, contratação e login

Prints: `LOJISTA/03-admin-login.png`, `LOJISTA/04-cadastrar-form.png`, `LOJISTA/05-pagamento-register-contratar.png`, `LOJISTA/06-cadastro-cpf-revelado.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Login e-mail primeiro ("Continuar →" desabilitado), senha/código depois; "Seus dados estão seguros" | `/entrar`: e-mail + senha + Turnstile num passo, botão habilitado, erro inline | 22 | AUTH-01, AUTH-04, T-06 | E-mail-primeiro só compensa com SSO/vários métodos; botão desabilitado esconde o motivo. | **já coberto** (manter nosso padrão) |
| "Não tem conta? Teste grátis por 7 dias" + "Criar minha conta" | Sem cadastro aberto | 22 | AUTH-02 | — | **fora do escopo por decisão 22** (convite) e **61** (sem trial) |
| Cadastro em 3 passos com CNPJ/CPF ("Não tenho CNPJ" troca a máscara) e WhatsApp | Ops cadastra a Loja (CNPJ, WhatsApp) no 29 | 29 | OPS-03 | Máscara + dígito verificador reduz erro; "Não tenho CNPJ" conflita com Loja = um CNPJ (glossário). | Máscaras: **adotar no 29**. CPF alternativo: **não adotar** (glossário: Loja tem CNPJ) |
| Dica sob o e-mail "Use o e-mail que você cadastrou" | Sem dica | 22 | AUTH-02 | Microcopy que evita o erro mais comum (e-mail errado). | **adotar adaptado no 22** ("…em que você recebeu o convite") |
| Fluxo de convite/definir senha | `/definir-senha?fluxo=convite\|reset` | 22 | AUTH-03 | Não aparece no Anota; nosso fluxo precisa de estado de link expirado. | **adotar no 22** |

## 3. Onboarding e checklist

Prints: `LOJISTA/09-onboarding-1-culinaria.png` a `LOJISTA/18-onboarding-pedido-teste.png`, `LOJISTA/24-pedidos-tour-final.png`, `LOJISTA/51-...png` (alerta "Finalize seu cadastro").

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Perguntas de culinária (multi) e objetivo (única) no 1º acesso | — | 28 | ONB-03 | Coleta dado de marketing do concorrente; para nós o Ops já sabe quem é a Loja. | **não adotar** |
| Cardápio-semente gerado pela culinária, editável, "Salvar e continuar" | — | 23, 28 | ONB-03 | Dá sensação de progresso, mas deixa itens fictícios no Cardápio real (risco de vender "Misto Quente R$ 12,90" que a Loja não tem). | **FORA DO ESCOPO — decidir** (pergunta P-ONB-3; recomendado não) |
| Checklist em tela própria "Falta pouco para suas vendas decolarem! 🚀", 3 passos travados em ordem, "Pular" | — | 28 | ONB-01, ONB-02, T-11 | Checklist é ótimo (onboarding progressivo); ordem forçada e emoji não. | **adotar adaptado no 28** |
| Widget flutuante "Comece por aqui! 1/4" (Simular pedido, Cardápio, Abrir loja, Assinar plano) | — | 28 | ONB-01 | Mesmo conteúdo do checklist num 2º lugar; cobre a fila. | **não adotar** (um só lugar) |
| Tela "Conheça mais sobre o robô" com "Com robô / Sem robô" | — | — | T-08 | Comparação baseada em medo; produto fora do escopo. | **fora do escopo por decisão 27 e 62** |
| "Bora testar seu Cardápio?" com celular interativo e "Já fiz o pedido teste" | Storefront público por Slug | 28, 30 | ONB-04, LNK-01 | Ver a Loja "pelos olhos do cliente" é valioso; Pedido de teste real não, porque só Loja `active` recebe Pedido e ele conta na faixa. | **adotar adaptado no 28** ("Abrir minha Loja"); Pedido de teste: **decidir** (P-ONB-2) |
| Itens do checklist ligados a Plano ("Assinar um plano") | Plano ativado pelo Ops | 28, 29 | ONB-02 | O Dono não consegue concluir sozinho; precisa entender quem faz. | **adotar adaptado no 28** (item não acionável) |

## 4. Pedidos: fila (kanban) e tour

Prints: `LOJISTA/19-apos-onboarding.png` a `LOJISTA/25-pedidos-kanban-comece-por-aqui.png`, `LOJISTA/51-pedidos-kanban-loja-aberta.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Três colunas Em análise / Em produção / Prontos para entrega, com contador | `orders-queue.tsx` em lista; estados Recebido → Em preparo → Saiu/Pronto → Concluído | 24 | PED-01 | Kanban dá leitura do fluxo de um relance, bom para balcão; precisa virar abas no celular. | **adotar adaptado no 24** |
| Colunas inteiras pintadas (vermelho, amarelo, verde) com texto branco/cinza | — | 24 | T-01, T-02, T-03 | Contraste ruim (cinza sobre laranja), cor como único código, fere a identidade outline. | **não adotar** |
| Card: "Pedido #", hora, X vermelho, "Expira em 00:14:48", cliente, telefone, tipo, valor, botão | Detalhe com itens/escolhas/endereço no componente antigo | 24, 12 | PED-02, PED-04, T-12 | Faltam forma e status de pagamento (crítico); X ao lado do relógio convida erro; contagem regressiva gera ansiedade e não existe no nosso domínio. | **adotar adaptado no 24** |
| Botões "Aceitar pedido →", "Avançar pedido →", "Finalizar pedido →" | Transições por `allowedOrderTransitions` | 24 | PED-03, T-11 | "Avançar" não diz para onde; o nosso fluxo tem destinos diferentes por Fulfillment. | **adotar adaptado no 24** |
| "Finalizar" em lote na coluna Prontos | — | 24 | — | Útil com volume alto; risco de concluir Pedido não entregue. | **FORA DO ESCOPO — decidir** (P-P-OPE-5; recomendado não) |
| Toggle "Aceitar os pedidos automaticamente" | — | 24 | — | Reduz cliques mas tira do lojista a chance de recusar; o nosso "Recebido" não expira. | **FORA DO ESCOPO — decidir** (P-OPE-1) |
| Linha "Balcão: Não informado · Delivery: Não informado · Editar" (tempo estimado) | — | — | — | Tempo estimado é informação que o Consumidor quer; não está na spec. | **FORA DO ESCOPO — decidir** (P-CFG-1) |
| "Pedidos atualizados" fixo | Polling 10 s | 24 | PED-06 | Indicador sem hora não prova nada; falta estado offline. | **adotar adaptado no 24** |
| Busca "cliente ou número do pedido" e filtro Todos/Delivery/Balcão | — | 24 | — | Útil a partir de dezenas de Pedidos/dia; com 3 colunas curtas é secundário. | **FORA DO ESCOPO — decidir** (P-OPE-2) |
| "+ Novo pedido" (lançamento manual) | — | — | — | É o PDV. | **fora do escopo por decisão 62** (ver P-PDV-1) |
| Vazio: "Nenhum pedido no momento. Compartilhe os seus links…" em todas as colunas | Placeholder "Nenhum Pedido em andamento." | 24 | PED-08 | Bom: vazio com próximo passo. Repetir a frase em 3 colunas é ruído. | **adotar adaptado no 24** |
| Banner "Bora receber pedidos reais? … Pegar link do cardápio →" (loja aberta) | — | 24, 28 | PED-08, LNK-01 | Ótimo momento para pedir divulgação. | **adotar adaptado no 24/28** (dentro do vazio, só Dono) |
| Tour de 4 popovers com Pedido de exemplo | — | 24 | PED-09 | Tours são pulados e não se repetem; a fila é simples o bastante para se explicar sozinha. | **não adotar** (P-ONB-1) |
| Trilho direito com contadores (garçom, salão, KDS, concluídos) | — | — | — | Atalhos para módulos que não temos. | **fora do escopo por decisão 62** |

## 5. Configurações de "Meus pedidos": canais, numeração, som, impressão, cancelamento

Prints: `LOJISTA/26-pedidos-config-1-status-sistema.png`, `LOJISTA/27-pedidos-config-2-sequencia.png`, `LOJISTA/28-...png` (igual ao 27), `LOJISTA/29-pedidos-config-4-impressao.png`, `LOJISTA/30-...png` (só carregamento).

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Status por canal (WhatsApp, Facebook, Instagram, Cardápio Digital) | Um canal; Pausa da Loja | 24 | CFG-02 | Para nós um canal só; a Pausa é o "desligar". | **não adotar**; canais extras **fora do escopo por decisão 27** |
| Numeração atual + "Dias para zerar" | `publicCode` gerado pelo servidor | 24 | — | Reiniciar numeração confunde histórico e relatórios. | **não adotar** |
| Passo "Som" (não capturado) | Som único por Pedido novo (23) | 24 | PED-05 | O problema real é o bloqueio de autoplay do navegador, não volume. | **adotar adaptado no 24** |
| Impressão automática (3 toggles: geral, KDS, itens por quilo) | Impressão manual 80 mm via `window.print` (62) | 24 | IMP-01, IMP-02 | Impressão silenciosa exige app instalado ou navegador em modo quiosque; KDS e quilo fora. | **não adotar no MVP** (P-P-IMP-1) |
| Passo "Cancelar" (não capturado) | Cancelamento + Estorno no 12 | 12 | CAN-01, CAN-02 | — | **adotar no 12** com as nossas regras |

## 6. Configurações do estabelecimento (10 passos)

Prints: `LOJISTA/31-config-estabelecimento-redigido.png` a `LOJISTA/40-...png` (ver avisos de nome trocado em PAINEL.md).

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Stepper de 10 passos numerados com rodapé "Salvar Alterações" | — | 24, 28 | T-07, NAV-05 | São seções independentes vestidas de wizard. | **adotar adaptado** (seções sem número) |
| 1. Informações: nome, responsável legal, CPF bloqueado, WhatsApp, contatos extras, Instagram, foto; banner "Potencialize suas vendas" | Dados da Loja vêm do Ops (29); contato no 28 | 28, 29 | CFG-04, T-08 | CPF bloqueado sem explicação; banner de upsell no meio do formulário. | **adotar adaptado no 28** (campos do Ops em só leitura com explicação) |
| 2. Endereço: CEP autopreenche, ocultar endereço Sim/Não, lat/long manual, mapa | Endereço cadastrado pelo Ops (29) | 29 | OPS-03 | CEP→endereço poupa digitação; lat/long e mapa só servem a raio/km. | CEP: **FORA DO ESCOPO — decidir** (P-CFG-4). Lat/long/mapa: **fora do escopo por decisão 42** |
| 3. Horários: fuso, "Sempre disponível / dias e horários / só agendados / fechado permanentemente", aba "Período de indisponibilidade" | `operation-panel.tsx` (dias, períodos, Pausa) | 24 | CFG-01, CFG-02 | Quatro modos confundem com a Pausa; fuso configurável gera erro. | **adotar adaptado no 24**; fuso **fora por decisão 58**; agendados **fora por 13/41** |
| Alerta "Atenção! Existem campos obrigatórios nesta sessão" (fechável) | — | 24 | T-06 | Alerta genérico sem apontar o campo; fechável some com o problema ainda lá. | **não adotar** (erro inline por campo) |
| 4. Tempo de entrega (Entrega/Retirada, mín/máx em min) | — | — | — | Valor alto para o Consumidor ("35–55 min"); não está na spec. | **FORA DO ESCOPO — decidir** (P-CFG-1) |
| 5. Formas de entrega: Delivery, Retirada (+ "aceitar só pagamento online"), Consumo no local | `delivery-panel.tsx`: Retirada liga/desliga | 24 | CFG-03 | "Pelo menos uma forma" é boa regra; consumo no local é salão. | **adotar adaptado no 24**; consumo no local **fora por 62**; "só online na Retirada": **decidir** (P-CFG-3) |
| 6. Pedido mínimo (Sim/Não + valor) | — | — | — | Protege margem do Delivery; o Storefront precisaria explicar o bloqueio. | **FORA DO ESCOPO — decidir** (P-CFG-2) |
| 7. Regiões: Bairro/Raio, toggles "cliente pode editar bairro/cidade", tabela Status/Bairro/Valor, "+ Bairro" em modal | Bairros + modo bairro/fixa (42) | 24 | CFG-03 | Tabela simples e boa; raio fora; modal para 2 campos é exagero; toggle de status poupa recadastro. | **adotar adaptado no 24**; raio **fora por 42**; toggle de bairro: **decidir** (P-CFG-5) |
| 8. Pagamento online / 9. Pagamento na entrega (não capturado) | Meios definidos pelo Ops (taxa vigente) | 26, 27 | — | O Dono não configura meio online (61). | **fora do escopo por decisão 61**; opções da entrega: **decidir** (P-CFG-3) |
| 10. Operação em salão Sim/Não | — | — | — | — | **fora do escopo por decisão 62** |

## 7. Pagamento online (chave Pix, iFood Pago)

Print: `LOJISTA/41-pagamento-online-conta-e-planos.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Lojista cadastra CNPJ, CPF, tipo e chave Pix para receber; lista formas ativas e prazos; "Repasse em dia não útil R$ 6,99" | Chave Pix e titular cadastrados pelo Ops (29); custódia `pilot_platform` | 29, 14 | CFG-04, REL-04 | Para nós o Dono só **vê** para onde vai o repasse e quando; editar chave é ato do Ops (fraude). | **adotar adaptado no 14** (Repasses mostra chave mascarada e prazos); cadastro pelo Dono **fora por decisão 60/62** |

## 8. Impressora e comanda

Prints: `LOJISTA/40-...png` (Informação impressora), `LOJISTA/42-...png` (Mensagem), `LOJISTA/43-...png`, `LOJISTA/44-config-impressora-3-comanda.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Impressora só via app de desktop ("Baixar Anota AI") | `window.print` 80 mm (62) | 24 | IMP-02 | Instalar app é atrito enorme para PME; nosso caminho é melhor no MVP. | **já coberto** (decisão 62) |
| Cabeçalho e rodapé do cupom (40 caracteres) com pré-visualização | — | — | — | Personalização simpática, valor baixo. | **FORA DO ESCOPO — decidir** (P-IMP-2) |
| Comanda: agrupar itens, nome dos grupos de adicionais, mesa/comanda | Layout 80 mm com itens e escolhas | 24 | IMP-01 | Mostrar o nome do grupo ("Ponto: mal passado") evita erro na cozinha. | **adotar no 24** (sempre com nome do grupo; sem opção) |
| "Notificação chamativa" por tipo (Entrega / Retirada / Consumo local) | — | 24 | IMP-01 | Excelente para cozinha: o tipo do Pedido salta da folha. | **adotar adaptado no 24** (sempre ligada) |

## 9. Frente de caixa e PDV (balcão)

Prints: `LOJISTA/45-config-frente-de-caixa.png`, `LOJISTA/74-pdv-balcao.png`, `LOJISTA/104-relatorio-caixas.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| PDV "Delivery e Balcão / Mesas e Comandas", permissões de caixa (abertura automática, sangria, suprimento), relatório de caixas | — | — | — | Módulo grande, com caixa físico e conciliação. | **fora do escopo por decisão 62** (PDV/balcão); ver P-PDV-1 |

## 10. Integrações

Print: `LOJISTA/46-config-integracoes.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| ID da loja + token JWT de integração em texto com "copiar"; catálogo de integrações; aba iFood | — | — | — | Token exibido em claro é risco (ombro, print); se um dia houver, mascarar e permitir rotação. | **fora do escopo por decisão 27** (iFood) e **62** |

## 11. Cardápio digital: configurações, cor, capa, link

Prints: `LOJISTA/47-config-cardapio-digital.png`, `LOJISTA/48-cardapio-digital-2-cor-capa.png`, `LOJISTA/49-cardapio-digital-7-link.png`, `LOJISTA/50-cardapio-publico-cliente.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Toggles: cardápio ativado, observação do pedido, "peça de novo", edição por clique | Loja `active` controla Pedidos; observações já vão no Pedido | 24 | — | "Cardápio ativado" duplica Pausa/estado da Loja. | **não adotar** |
| Cor do cardápio + imagem de capa (800×200) + prévia claro/escuro | Storefront no visual Foode | — | — | Identidade da Loja pesa no "canal próprio"; cor livre arrisca contraste. | **FORA DO ESCOPO — decidir** (P-VIS-1, P-VIS-2) |
| Descrição e rodapé, produtos em destaque, descartáveis, produtos esgotados, clonagem iFood (não capturados) | — | — | — | Itens de merchandising; clonagem iFood é integração. | Destaque/descrição: **decidir** (P-VIS-3). Clonagem: **fora por decisão 27** |
| "7. Link do Cardápio": URL + copiar + mock de celular | — | 28 | LNK-01 | Simples e certo; mas está enterrado no passo 7 de uma tela de config. | **adotar adaptado no 28** (seção Divulgação, com QR) |

## 12. Gestor de cardápio: categorias, itens, adicionais, classificações, disponibilidade

Prints: `LOJISTA/52-cardapio-gestor.png` a `LOJISTA/63-cardapio-item-concluido.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Banner "Recomendado — Agilize o cadastro… Enviar cardápio" (equipe cadastra por foto) | — | — | — | Serviço humano de cadastro; ajuda muito no início. | **FORA DO ESCOPO — decidir** (P-CAR-4) |
| Dois painéis: categorias à esquerda, itens à direita; "Exibindo 1 de 1 categorias" | `menu-panel.tsx` em lista única | 23 | CAR-01 | Padrão mestre-detalhe eficiente no desktop. | **adotar adaptado no 23** |
| Linha do item: arrastar, foto, nome, toggle "Esgotar", preço editável inline, link, ⋮, › | Disponibilidade e preço via formulário | 23 | CAR-02, CAR-03, CAR-04 | Inline acelera; toggle rotulado com ação é ambíguo; preço inline sem confirmação é perigoso. | **adotar adaptado no 23** |
| Nova categoria: Modelo (Itens principais / Pizza), Promoção, Disponível/Pausado/Personalizado, canais (Garçom, PDV, Cardápio, QR) | Categoria com nome e ordem | 23 | CAR-07 | Pizza meio a meio e canais são módulos que não temos; "Personalizado" é cardápio por horário. | Pizza: **decidir** (P-CAR-2). Canais: **fora por 62**. Personalizado: **fora por decisão 13** |
| Botão dividido "Salvar Alterações ▴" → "Salvar e criar itens" / "Salvar" | — | 23 | CAR-07 | Opção escondida em menu; ninguém descobre. | **adotar adaptado no 23** |
| Item em 4 abas-passo (Item, Adicionais, Classificações, Disponibilidade) com toast em cada uma | Item + Complementos/Adicionais no `item-customization-panel.tsx` | 23 | CAR-05 | Wizard para dados curtos multiplica cliques. | **adotar adaptado no 23** (página única em seções) |
| Drawer "Criar grupo de adicionais": nome, identificador interno, Opcional/Obrigatório, mín/máx, adicionais com foto, preço, "Máx", descrição | Grupos de Complemento e Adicionais por item | 23 | CAR-06 | Cartões Opcional/Obrigatório + steppers são claros; identificador interno, foto por adicional e "Máx" por opção são excesso para o MVP. | **adotar adaptado no 23** |
| "Grupos de Adicionais já existentes" (reuso entre itens) + "Precificação: Somatório" | Grupos por item | 23 | — | Reuso poupa muito retrabalho (ex.: "Ponto da carne" em 10 lanches), mas muda o modelo. | **FORA DO ESCOPO — decidir** (P-CAR-1) |
| Classificações: Comida/Bebida, vegano, sem glúten, orgânico… com aviso legal | — | — | — | Valor real para parte do público; responsabilidade legal do lojista. | **FORA DO ESCOPO — decidir** (P-CAR-3) |
| Disponibilidade do item: Disponível / Pausado / Personalizado | Disponível liga/desliga (13) | 23 | CAR-02 | Liga/desliga basta; Personalizado é horário por item. | **já coberto**; Personalizado **fora por decisão 13** |
| Imagens do cardápio, Edição em massa, Potencializador, Importação inteligente, Importação iFood (menu) | Upload R2 por item | 23 | — | Em massa ajuda reajuste de preços; importações são serviço/integração. | Massa: **decidir** (P-CAR-5). iFood: **fora por 27** |

## 13. Cupons

Prints: `LOJISTA/64-cupons-lista.png` a `LOJISTA/71-cupons-lista-com-teste10.png`, `LOJISTA/100`–`102` (relatório).

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Lista com toggle de status, Retirados, Desconto, Desconto em, Pedido mínimo, Validade, Visível, ações | — | 13 | CUP-01 | Boa tabela; "Visível" e "Desconto em" dependem de recursos fora do ticket. | **adotar adaptado no 13** |
| "Sugestão de cupons inteligentes" + "Ativar todos" + "Ver desempenho" | — | 13 | CUP-05, T-08 | Resolve o branco inicial, mas ativar 4 descontos num clique empurra margem para baixo. | **não adotar** "Ativar todos"; modelos: **decidir** (P-CUP-5) |
| Vazio "Ainda não há cupons cadastrados" + "+ Cupom" | — | 13 | CUP-01 | Bom. | **adotar no 13** |
| Novo cupom em 4 passos (Crie, Tipo, Uso, Disponibilidade) com Anterior/Próximo | — | 13 | CUP-02, CUP-03 | ~8 campos não pedem wizard; falta resumo do que foi configurado. | **adotar adaptado no 13** (página única + resumo vivo) |
| Código máx. 10, descrição máx. 40, "válido só para cliente novo", "Desconto em: Produto/Frete" | Código, % ou R$, validade, limite, pedido mínimo, ativo (13) | 13 | CUP-02 | "Só cliente novo" ≈ nosso Cupom de boas-vindas; frete conflita com o Ticket 13 ("não incide sobre a taxa de Delivery"). | Código/limites: **adotar no 13**. Frete: **decidir** (P-CUP-2; diverge do critério do Ticket 13) |
| Percentual com "Valor máximo do desconto" | — | 13 | — | Teto evita desconto enorme em Pedido grande; custo baixo. | **FORA DO ESCOPO — decidir** (P-CUP-1) |
| Uso: Ilimitado / Limitado / Escolher cliente; "Quantas vezes?" | Limite total de usos (13) | 13 | CUP-02 | "Escolher cliente" depende de base de clientes e robô. | Limite total: **já coberto**. Escolher cliente: **fora por decisão 27/45** |
| Disponibilidade: sem expiração, dias da semana, envio pelo robô, "Cupom visível" na carteira | Validade (13) | 13 | — | Dias da semana e vitrine de cupons são extras; robô fora. | Dias/vitrine: **decidir** (P-CUP-3, P-CUP-4). Robô: **fora por 27/62** |
| Menu do salvar "Salvar e enviar cupom" | — | — | — | Envio depende de robô/base de contatos. | **fora do escopo por decisão 27** |

## 14. Salão, mesas e QR Code de mesa

Prints: `LOJISTA/75-pedidos-salao.png`, `LOJISTA/76-pedidos-salao-mesas.png`, `LOJISTA/77-mesas-qrcode-menu.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Mesas/Comandas com status, app garçom, QR por mesa, taxa de serviço | QR Code **da Loja** (28) | 28 | LNK-01 | O QR da Loja já atende o balcão/mesa como "abrir Cardápio"; QR por mesa exige Pedido de mesa. | **fora do escopo por decisão 62** (mesas/garçom) |

## 15. Relatórios, desempenho, funil, clientes, itens, caixas, satisfação

Prints: `LOJISTA/78-relatorios-geral.png`, `LOJISTA/79-meu-desempenho-dashboard.png`, `LOJISTA/94-relatorio-pedidos.png` a `LOJISTA/106-relatorio-cashback.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| "Meu Desempenho" e "Relatório Geral" separados (ambos vazios) | — | 14 | REL-01 | Duas telas para a mesma pergunta ("como estou indo?"). | **adotar adaptado no 14** (uma página) |
| Relatório de Pedidos: 3 números (total, cancelados, total das vendas), filtros Pagamento/Entrega/Status/Origem + "Filtrar", tabela paginada, imprimir, exportar, período | Relatórios por status, Fulfillment e meio (14) | 14 | REL-01, REL-02 | Bom esqueleto; botão "Filtrar" separado é passo a mais (filtrar ao mudar). | **adotar adaptado no 14**; exportar: **decidir** (P-REL-1) |
| Coluna "Nota fiscal" e "Emissão de nota fiscal em lote" | — | — | — | — | **fora do escopo por decisão 27 e 62** |
| Clientes em potencial / ativos / inativos, TOP 10, importar/cadastrar cliente | Snapshot do Guest no Pedido | — | — | CRM com dado pessoal; exige base LGPD e uso (cupom direcionado, robô). | **FORA DO ESCOPO — decidir** (P-REL-3) |
| Itens: ranking com % por dia da semana | — | 14 | — | "O que mais vende" é a pergunta nº 1 do dono de restaurante; agregado simples dos snapshots. | **FORA DO ESCOPO — decidir** (P-REL-2) |
| Funil de conversão (visitas → produto → carrinho → finalização → concluído) | Pixel Meta/Google (28) | — | — | Exige telemetria própria; o Pixel já entrega funil nas ferramentas do anunciante. | **FORA DO ESCOPO — decidir** (P-REL-4) |
| Cupons (todos / seus / inteligentes) com vazio "Ir para o cadastro de Cupom" | — | 13, 14 | REL-02 | Usos por Cupom cabem na lista de Cupons (coluna Usos). | **adotar adaptado no 13** (coluna Usos; sem relatório próprio) |
| Caixas, Satisfação (NPS), Cashback, Entregadores, Garçons, Mesas | — | — | — | — | **fora do escopo por decisão 62** (PDV, mesas, cashback); satisfação/NPS **decidir** só se P-REL-3 avançar — não perguntado |
| Comparativo com período anterior (proposta do PAINEL.md) | — | 14 | — | Dá contexto ao número; custo baixo. | **FORA DO ESCOPO — decidir** (P-REL-5) |

## 16. Robô de WhatsApp

Prints: `LOJISTA/16-onboarding-robo-whatsapp.png`, `LOJISTA/80-robo-configuracoes.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Robô de atendimento, chamados de atendente, feedback, mensagens personalizáveis | `wa.me` da Loja no Storefront | 24 | PED-07 | — | **fora do escopo por decisão 27 e 62**; atalho `wa.me` pelo Painel: **decidir** (P-WPP-1) |

## 17. Notas fiscais (NFC-e)

Prints: `LOJISTA/81-nf-relatorio-nfce-modal-categorias.png` a `LOJISTA/88-nf-inutilizacao-nfce.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Relatório NFC-e, configuração (CNPJ, CSC, certificado A1), categorias tributárias, 7 permissões, inutilização | — | — | — | Módulo fiscal pesado (certificado, SEFAZ). | **fora do escopo por decisão 27 e 62** |

## 18. Cashback

Prints: `LOJISTA/89-cashback-principal.png` a `LOJISTA/93-cashback-config-item-categoria.png`, `LOJISTA/106-relatorio-cashback.png`.

| Concorrente | Temos | Ticket | Diretriz | Avaliação | Classificação |
| --- | --- | --- | --- | --- | --- |
| Cashback em 4 modos (um clique, simples, por dia, por item/categoria), expiração, só pagamento online | — | — | — | Bem desenhado (modal de modo + "Recomendado"), mas é programa de fidelidade. | **fora do escopo por decisão 45 e 62** |

## 19. Outros itens do menu (não capturados)

| Item | Classificação |
| --- | --- |
| Pedidos agendados | **fora do escopo por decisão 13 e 41** |
| Entregas / Entregadores | **fora do escopo por decisão 42** (frota) e spec (Out of Scope) |
| Cozinha – KDS | **fora do escopo por decisão 27 e 62** |
| Recuperador de vendas, Compre + Ganhe | **fora do escopo por decisão 62** |
| Redes Sociais, Integração de anúncios | Pixel cobre anúncios (**já coberto no 28**); redes sociais: link no Storefront é tema do CLIENTE |
| Minha conta: Formas de pagamento, Fatura | Cobrança fora do app (**fora por decisão 61**) |
| Minha conta: Colaboradores | **já coberto** por `/equipe` (22), EQP-01 |
| Benefícios, Indique e Ganhe, Sugestões | **não adotar** (fora do produto) |
