# 74 — Padrão de cadastro em modal, Toast no Storefront e prévia da Loja em configuração

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Substitui:** CAR-05 (item numa página só), o "+ Bairro em linha (sem modal)" da CFG-03 e o formulário do Cupom "numa página" da CUP-02, todos em [DIRETRIZES-UX-LOJISTA](../referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) · **Complementa:** [63](63-decisoes-ux-benchmark-anota.md), [64](64-revisao-adversarial-escopo-mvp.md), [67](67-estrategia-testes-automatizados.md), [70](70-landing-paginas-publicas-seo.md), [71](71-tarifa-servico-parcelamento-anual.md), [72](72-banner-plano-sidebar.md)

Pedidos do Dono depois de usar o Painel em produção (fila do orquestrador, `plano-ondas.md`).

## 1. Todo cadastro do lojista em modal

- **Componente único** `CadastroModal` (`apps/admin/src/components/cadastro-modal.tsx`):
  - **Desktop (≥ 768 px):** modal central sobre a página, com o fundo **escurecido e desfocado** (`backdrop-blur`); caixa de fundo sólido, borda fina, cantos arredondados (ADR 0005).
  - **Celular (< 768 px):** **sheet inferior que sobe** (alça no topo, até 92% da altura).
  - **Foco preso** enquanto aberto (Tab/Shift+Tab circulam) e devolvido a quem abriu; `role="dialog"`, `aria-modal`, título como nome acessível.
  - **Esc, o X e o clique no fundo** pedem para fechar; com mudança não salva, perguntam antes ("Descartar as alterações?" · "Continuar editando" / "Descartar").
  - Animação só de entrada; desligada com `prefers-reduced-motion`.
- **Etapas** quando o cadastro tem mais de uma parte: indicador "1 Dados › 2 Complementos (opcional) › 3 Adicionais (opcional)" com a atual em `aria-current="step"`; **Voltar sem perder dados** (as etapas ficam montadas, só escondidas); **"Pular"** só nas etapas opcionais. Erro de campo de outra etapa reabre a etapa do campo e dá foco nele.
- **Edição** usa as **mesmas etapas como abas** (`role="tablist"`, setas ←/→, Home/End), também com os painéis montados.
- **Menos scroll vertical no desktop:** o conteúdo longo vira etapas/abas dentro do modal, com rodapé de ações fixo.
- Aplicado a:
  - **Item do Cardápio:** Dados → Complementos → Adicionais (as duas últimas puláveis). "Continuar" na etapa Dados cria o item; Voltar e Continuar sem mudança só avançam (com mudança, salvam antes). Ao concluir (ou fechar depois de criado), o modal fecha, o Cardápio abre a categoria do item e o **Toast** confirma ("Misto Quente adicionado ao Cardápio."). **Sem** o link "Configurar complementos e adicionais para esse item agora". O 1º item pode criar a categoria junto ("+ Nova categoria" no seletor; sem categorias, um campo "Categoria do item").
  - **Edição de item:** abas Dados · Complementos (N) · Adicionais (N); "Apagar item" no rodapé da aba Dados, com a confirmação da T-12.
  - **Categoria**, **Cupom** (2 etapas: Desconto → Validade e limites, com o resumo vivo da CUP-03 sempre visível; edição em abas), **bairro de entrega** ("+ Bairro" abre o modal com nome, taxa — com a sugestão por km da [73](73-sugestao-taxa-por-km.md) como placeholder — e ativo; valida repetido e salva na hora) e **convite de Operador** na Equipe.
  - Endereços antigos (`/cardapio/itens/novo`, `/cardapio/itens/<id>`, `/cupons/novo`, `/cupons/<id>`) redirecionam para a lista com o modal aberto (`?novo=item`, `?item=<id>`, `?novo=1`, `?cupom=<id>`).
- **Fica fora** (não é cadastro do lojista ou é edição em linha): renomear categoria, preço e disponibilidade inline (CAR-02/03), períodos de Horários (CFG-01) e o cadastro de Loja do Ops (OPS-03, página com seções).

### Página do Cardápio

- Um CTA principal só: **"Adicionar item"** no topo; **"Criar categoria"** no topo da coluna de categorias (esquerda).
- Sai o aviso "Categoria X criada" com CTA, o "Adicionar item" repetido no cabeçalho de cada categoria e no estado vazio da categoria, e o bloco de onboarding com formulário de categoria: os estados vazios só explicam e apontam para o CTA do topo (T-04).

## 2. Toast padrão também no Storefront

- O Toast de `@foode/ui` ([72](72-banner-plano-sidebar.md): fundo preto, texto branco, 4 s, X, topo-centro no desktop e topo no celular) substitui o toast local do Storefront.
- Ganha **ação opcional de um toque** e duração própria: "X-Burger adicionado ao carrinho · Ver carrinho" (I7) e "X-Burger removido · Desfazer" por 5 s (K2).
- Também no Toast: "Código copiado" do PIX e "Cupom X aplicado: −R$ Y". **Erro continua inline** junto do campo (G4): Cupom recusado, falha ao copiar.

## 3. Prévia da Loja em configuração (`onboarding`)

- `GET /storefront/lojas/:slug/cardapio` devolve o Cardápio da Loja em `onboarding` com **`state: "preview"`** (`publicMenuSchema`, campo opcional; ausente = `live`). Loja `suspended` (e Slug inexistente) continua **404 `store_not_found`**.
- Só a leitura do Cardápio vê a prévia: **carrinho, cotação e criação de Pedido continuam exigindo Loja `active`** (404), na mesma escrita de sempre.
- O Storefront mostra a faixa **"Esta Loja ainda não está recebendo pedidos"**, deixa montar o carrinho mas **bloqueia carrinho → checkout** ("Pedidos indisponíveis agora"; `/finalizar` volta ao Cardápio) e fica **`noindex`** enquanto em prévia.
- Testes: `menu.d1.test.ts` e `storefront.d1.test.ts` (prévia, carrinho/cotação/Pedido recusados), contrato em `@foode/shared/menu` e componentes do web.

## 4. Testes

Componente (decisão 67): `cadastro-modal.test.tsx` (etapas, Voltar, Pular, Esc com e sem mudança, clique no fundo, foco preso e devolvido, sheet no celular, abas) e os fluxos migrados (`cardapio-cadastros.test.tsx`, Cupom, bairro, convite, Toast com ação, prévia no Storefront).

## Pendência ligada

- O R$/km da sugestão de taxa ([73](73-sugestao-taxa-por-km.md)) ainda é do `localStorage`; troca pela RPC `storeSetDeliveryRate` (migration 0008, Ticket 31-leads) quando ela entrar na `master` (TODO em `fulfillment-form.tsx`).
