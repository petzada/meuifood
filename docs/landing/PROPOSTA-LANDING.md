# Proposta — nova landing da Foode Delivery

**Data:** 2026-11-05 · **Status:** proposta (decisões em aberto em [PERGUNTAS-LANDING.md](PERGUNTAS-LANDING.md)) · **Base:** [ANALISE-ATUAL.md](ANALISE-ATUAL.md), decisões 01–05, 14, 15, 40, 61–64, [FOODE-BRAND](../FOODE-BRAND.md), [ADR 0005](../adr/0005-brand-foode-outline-taste-skill.md), benchmark Anota.ai (`docs/referencias/anota-ai/LOJISTA/01-site-home.png`, `02-planos.png`, `72-planos.png`, `73-planos-rodape.png`), landings de Goomer e Delivery Direto (padrões, lidas em 2026-11-05).

Nada aqui é código. Onde a proposta depende de decisão do Dono, o texto marca `[Q-tema-n]` e aponta para a pergunta.

## 0. Princípios

1. **Uma promessa, um CTA.** A página inteira existe para gerar uma conversa com a Foode (cadastro de Loja é feito pelo Ops, [62](../decisoes/62-escopo-ops-multiloja-funcionalidades.md); não há self-serve nem trial, [61](../decisoes/61-monetizacao-faixas-taxas-anota.md)). Todo botão primário leva ao mesmo destino `[Q-cta-1]`.
2. **Dor → solução → prova → preço → objeções → CTA.** Ordem de leitura do ICP que já paga comissão ([02](../decisoes/02-publico-icp-pme-delivery.md), [03](../decisoes/03-posicionamento-complementar-e-troca-saas.md)).
3. **Produto real, não stock.** Telas do Storefront e do Painel em mockups de celular/notebook. Foto de comida só como fundo contextual.
4. **Complementar ao iFood, não "saia do iFood".** Comparativo com "marketplace" sem citar marca ([03](../decisoes/03-posicionamento-complementar-e-troca-saas.md)).
5. **Preço na página, inteiro, sem truque.** Faixas da decisão 61, anual sem "de/por" inventado, "+ taxas de pagamento online" explícito.
6. **Identidade Foode:** canvas branco, outline 1 px, sem shadow, Nunito, primary `#F35050` em borda/ícone/marca, `--color-primary-strong` em fundos com texto, accent `#FFB800` em um só momento.
7. **Mobile primeiro.** O lojista abre o link pelo WhatsApp no celular. Cada seção tem wireframe mobile.

## 1. Arquitetura da página

```
Header fixo (logo · Como funciona · Funcionalidades · Preços · FAQ · [Entrar] · [CTA])
 1. Hero            proposta de valor + CTA + mockup celular Storefront
 2. Faixa de prova  números / Lojas / "sem comissão · sem fidelidade · sem app"
 3. Dor vs. canal   o que a comissão come (comparativo visual)
 4. Como funciona   3 passos sticky/scrollytelling com telas reais
 5. Funcionalidades bento grid (Cardápio, Checkout, Pagamento online, Fila, Cupons, Relatórios…)
 6. Para quem       segmentos (hamburgueria, pizzaria, marmita, açaí, sushi, padaria…)
 7. Preços          faixas mensais + anual + taxas de pagamento + o que está incluso
 8. Comparativo     marketplace × SaaS concorrente × Foode (sem marcas)
 9. Depoimentos     1–3 casos locais (quando existirem) [Q-prova]
10. FAQ             8–10 perguntas (FAQPage JSON-LD)
11. CTA final       "Vamos abrir seu Canal próprio" + formulário curto ou WhatsApp
Footer              links, legal, CNPJ, redes, "Entrar no Painel"
```

Hierarquia tipográfica (desktop / mobile): H1 `2.5rem / 1.875rem` 700, H2 `2rem / 1.5rem` 700, H3 `1.25rem` 700, body `1rem–1.125rem`, eyebrow `0.875rem` 700 uppercase tracking `0.12em`. Mantém "hierarquia modesta" do FOODE-BRAND, mas com degrau real entre H1 e H2 (hoje são iguais).

Container `max-w-7xl`, gutters `px-4 / md:px-8`, seções `py-16 / md:py-24`, base 8 px.

## 2. Seção a seção

### 2.1 Header

- Esquerda: logo (asset wordmark, 120 px desktop / 96 px mobile).
- Centro (desktop): Como funciona · Funcionalidades · Preços · FAQ (âncoras).
- Direita: "Entrar" (link discreto para `admin.foodedelivery.com.br`) + botão primário `[CTA]`.
- Mobile: logo + botão CTA compacto + ícone de menu que abre sheet (mesma `.foode-sheet` do Storefront) com as âncoras e "Entrar".
- Fixo ao rolar, com hairline inferior quando `scrollY > 0`; altura 64 px. Sem blur/sombra.

### 2.2 Hero

**Objetivo:** em 5 s o lojista entende *o que é*, *para quem* e *quanto custa*, e vê o produto.

Microcopy sugerida (PT-BR):

- Eyebrow: `Cardápio digital e pedidos sem comissão`
- H1: `Seu delivery, no seu link. Sem comissão por pedido.`
  - Alternativas `[Q-hero-1]`: `Venda delivery direto pelo seu link, sem pagar comissão.` / `O canal próprio do seu delivery, a partir de R$ 84,99 por mês.`
- Sub: `Cardápio, checkout com PIX e cartão, fila de pedidos e relatórios. Seu cliente pede pelo celular, sem instalar app. Você paga uma mensalidade fixa por faixa de pedidos — e nada por pedido.`
- CTA primário: `Falar com a Foode` `[Q-cta-1]` · CTA secundário (outline): `Ver preços` (→ `#precos`).
- Linha de confiança sob os CTAs: `A partir de R$ 84,99/mês · Sem fidelidade · Sem comissão · Sem app para o cliente`.
- Visual: mockup de celular com o Storefront real de uma Loja (Cardápio com Destaques) em primeiro plano; atrás, parcial, o Painel com a fila de Pedidos (tablet/notebook). Ver §4 motion.

```
DESKTOP
┌──────────────────────────────────────────────────────────────────┐
│ EYEBROW                                     ┌──────────────────┐ │
│ H1 Seu delivery, no seu link.               │  ┌──────┐        │ │
│    Sem comissão por pedido.                 │  │ cel  │ painel │ │
│ sub ...........................             │  │store │ (atrás)│ │
│ [Falar com a Foode] [Ver preços]            │  │front │        │ │
│ A partir de R$ 84,99/mês · Sem fidelidade   │  └──────┘        │ │
└──────────────────────────────────────────────────────────────────┘
MOBILE
┌──────────────────────┐
│ EYEBROW              │
│ H1 (1.875rem)        │
│ sub                  │
│ [Falar com a Foode ] │  ← full width
│ [Ver preços        ] │
│ R$ 84,99/mês · …     │
│ ┌──────────────────┐ │
│ │ mockup celular   │ │  ← altura reservada (aspect-ratio)
│ └──────────────────┘ │
└──────────────────────┘
```

Não fazer: hero `100dvh` com foto stock; formulário de 7 campos no hero (padrão Anota, ver §3).

### 2.3 Faixa de prova (logo abaixo do hero)

Três a quatro chips outline em linha, scroll horizontal no mobile:

`0% de comissão` · `PIX e cartão online` · `Repasse em 1 dia útil após a liberação` · `Suporte humano no onboarding`

Quando houver Lojas ativas: `+N Lojas na região` com logos quadrados reais (4–8, grayscale, altura 40 px). Sem Lojas ainda: omitir a contagem `[Q-prova-1]`. Nunca inventar número.

### 2.4 Dor vs. Canal próprio

H2: `Cada pedido no marketplace custa até 27% da sua venda.` (número configurável; citar faixa pública "12–27%" sem marca) `[Q-conteudo-2]`
Sub: `No seu Canal próprio o pedido é seu, o cliente é seu e a mensalidade é fixa.`

Visual: comparativo em barras horizontais outline — ticket médio R$ 60: "Marketplace: você recebe R$ 44" vs. "Foode: você recebe R$ 60 − taxa do PIX". Texto explica que o canal próprio é **complementar** (o marketplace continua trazendo cliente novo; o recorrente pede no seu link).

```
DESKTOP (faixa assimétrica 5/7)
┌────────────────┬─────────────────────────────────────┐
│ H2             │ ████████████████░░░░░░  Marketplace  │
│ sub            │ ██████████████████████  Canal próprio│
│ bullets (3)    │ legenda · "simulação com ticket R$60"│
└────────────────┴─────────────────────────────────────┘
MOBILE: H2, barras (stack), bullets.
```

### 2.5 Como funciona (3 passos, sticky)

H2: `Do link ao pedido em três passos.`

| Passo | Título | Texto | Tela |
| --- | --- | --- | --- |
| 1 | Divulgue seu link ou QR Code | A Foode cadastra sua Loja e você monta o Cardápio. Coloque o link na bio, no WhatsApp e na mesa. | Painel: onboarding com link + QR |
| 2 | Seu cliente pede pelo celular | Cardápio com busca e destaques, checkout em uma tela, PIX, cartão ou pagamento na entrega. Sem app, sem cadastro obrigatório. | Storefront: item → carrinho → checkout |
| 3 | Você aceita, imprime e entrega | Fila com som, impressão 80 mm, aviso no WhatsApp com link de acompanhamento. | Painel: fila de Pedidos |

Layout desktop: coluna esquerda com os três passos (texto rola), coluna direita `sticky` com o mockup que troca de tela conforme o passo ativo (scrollytelling, §4). Mobile: cada passo = texto + imagem empilhados, sem sticky.

### 2.6 Funcionalidades (bento grid)

H2: `Tudo que o delivery precisa. Nada que você não vai usar.`

Grid 12 colunas, 6 cards outline de tamanhos diferentes (desktop); mobile em coluna. Cada card: ícone Phosphor (primary), H3, 1–2 linhas, miniatura real quando couber.

| Card | Tamanho | Título | Texto |
| --- | --- | --- | --- |
| A | 7×2 | Cardápio com complementos e adicionais | Categorias, fotos, destaques, busca, disponibilidade por item e "copiar grupos de outro item". |
| B | 5×1 | Checkout em uma tela | Delivery por bairro ou taxa fixa, retirada, pedido mínimo, troco, cupom, CEP que preenche o endereço. |
| C | 5×1 | PIX e cartão online | Taxa Foode única por meio; repasse em lote diário, 1 dia útil após a liberação. |
| D | 4×1 | Fila de Pedidos | Som, chips Delivery/Retirada, imprimir ao aceitar, cancelamento com estorno automático. |
| E | 4×1 | Cupons e boas-vindas | Código, % ou R$, dias da semana, limite de usos. |
| F | 4×1 | Relatórios e funil | Top itens por dia da semana, funil visita → pedido, CSV, Pixel Meta e Google. |

Rodapé do grid: linha discreta `Em breve: …` **não** (decisão: nada de roadmap na landing; evita prometer o que a 62 deixou fora).

### 2.7 Para quem

H2: `Feito para quem já vende delivery.`
Chips/cards pequenos com ícone: Hamburgueria · Pizzaria · Marmitaria · Açaí e sorvetes · Japonês · Padaria e confeitaria · Lanches e salgados. Cada um pode virar página de segmento (ver [PROPOSTA-SEO](PROPOSTA-SEO.md)) `[Q-paginas-2]`. Sub: `Se você já recebe pedidos pelo WhatsApp, Instagram ou marketplace, a Foode é o próximo passo.`

### 2.8 Preços

H2: `Um plano. O valor acompanha seus pedidos.`
Sub: `Mensalidade por faixa de Pedidos do mês. Sem comissão, sem fidelidade, sem teste grátis — a Foode acompanha a ativação da sua Loja.`

Dois cards lado a lado (igual Anota, adaptado):

```
┌────────── Mensal ──────────┐  ┌────────── Anual ───────────┐
│ "Você começa aqui"          │  │ selo accent: Pedidos ilimit.│
│ Até 150 pedidos  R$ 84,99   │  │ 12× R$ 84,99               │
│ 151 a 250        R$ 169,99  │  │ = R$ 1.019,88 / ano        │
│ Acima de 250     R$ 254,99  │  │ "preço fixo, sem faixa"     │
│ + taxas de pagamento online │  │ + taxas de pagamento online │
│ [Falar com a Foode]         │  │ [Falar com a Foode]         │
│ Sem fidelidade              │  │ Pago uma vez, fora do app   │
└─────────────────────────────┘  └─────────────────────────────┘
```

Abaixo: "O que está incluso em qualquer faixa" (lista de 8 itens: Cardápio, Storefront, checkout, PIX/cartão, fila, impressão, cupons, relatórios, suporte) e o bloco **Taxas de pagamento online**: "PIX e cartão têm uma taxa Foode por transação, combinada no cadastro da Loja; o pagamento na entrega não tem taxa." Mostrar os números? → `[Q-planos-2]` (a tabela nasce vazia e é definida no `/ops` por Loja, [61](../decisoes/61-monetizacao-faixas-taxas-anota.md)).

Regras: sem "de/por" riscado (não há preço anterior real), sem "economize R$ X" inventado; a economia real do anual vs. mensal depende da faixa — pode-se mostrar `Equivale a R$ 84,99/mês em qualquer volume`. Mobile: cards empilhados, Mensal primeiro `[Q-planos-1]`.

### 2.9 Comparativo

H2: `Como a Foode se compara.`
Tabela outline, 3 colunas: Marketplace · Outros SaaS de cardápio · Foode. Linhas: comissão por pedido / mensalidade / quem é dono do cliente / pagamento online / repasse / fidelidade contratual / app obrigatório / suporte no onboarding. Sem marcas; valores dos concorrentes em faixas públicas ("a partir de R$ 99,99") ou "varia" `[Q-conteudo-3]`. Mobile: cards por coluna com swipe, ou tabela com a coluna Foode fixa.

### 2.10 Depoimentos / casos

Só com conteúdo real: foto da fachada ou logo, nome, cidade, 1 frase, 1 número (pedidos/mês no Canal próprio). Enquanto não houver: seção omitida; **nunca** placeholder. Alternativa inicial: "Loja-modelo" com link para o Storefront real em `/loja/[slug]` — "Veja um cardápio ao vivo" `[Q-prova-2]`.

### 2.11 FAQ (accordion nativo `<details>`)

1. Preciso de computador? — Não; Painel e Storefront funcionam no celular. Para imprimir, um navegador com impressora térmica 80 mm.
2. Meu cliente precisa instalar app ou criar conta? — Não. Pede como visitante; conta opcional por código no WhatsApp.
3. Como recebo o dinheiro do PIX e do cartão? — Lote diário por Loja, 1 dia útil após a liberação do provedor; extrato no Painel.
4. Tem taxa por pedido? — Não. Mensalidade por faixa + taxa Foode só em pagamento online.
5. E o pagamento na entrega? — Sem taxa; informe "troco para".
6. Preciso sair do iFood? — Não; a Foode é o canal para o cliente recorrente.
7. Tem fidelidade ou multa? — Não.
8. Tem teste grátis? — Não; a Foode cadastra sua Loja e acompanha a ativação.
9. Como funciona o cadastro? — Você fala com a Foode, a equipe cria a Loja e envia o convite; você monta o Cardápio.
10. Posso usar meu próprio domínio? — Hoje a Loja fica em `foodedelivery.com.br/loja/sua-loja`.

### 2.12 CTA final

Faixa com fundo `--color-primary-strong` (único bloco com fill forte, texto branco ≥ 4,5:1), H2 `Vamos abrir o seu Canal próprio?`, sub `Conte como é o seu delivery e a Foode responde no mesmo dia útil.`, CTA branco outline sobre o primary `[Q-cta-1]`; se formulário: nome, WhatsApp, nome da Loja, cidade, "pedidos por dia" (segmentado: até 10 / 10–50 / 50+) `[Q-cta-2]`. Turnstile já existe no projeto.

### 2.13 Footer

4 colunas desktop (2 no mobile): Produto (Como funciona, Funcionalidades, Preços, FAQ) · Para quem (segmentos) · Foode (Sobre, Contato, Entrar no Painel) · Legal (Termos, Privacidade). Linha final: logo compacto, `Foode Delivery · CNPJ … · cidade`, redes. Sem newsletter.

## 3. Padrões dos concorrentes: adotado, adaptado, rejeitado

| Padrão | Fonte | Decisão | Avaliação |
| --- | --- | --- | --- |
| Preço de ancoragem no H1 ("Seu primeiro ano por 12× R$ 99,99") | Anota | **Adaptado** | Preço na linha de confiança e em `#precos`; H1 fica com a promessa. O ICP compara preço, então ele precisa estar na primeira dobra, mas não como manchete. |
| Formulário de 7 campos no hero | Anota | **Rejeitado** | Alta fricção; qualifica lead para time de vendas grande. A Foode é venda consultiva local ([05](../decisoes/05-escopo-geografico-e-gtm-local.md)): 3–5 campos ou WhatsApp direto bastam. |
| Dois cards Anual × Mensal com faixas por pedidos | Anota | **Adotado** | Mesmo modelo comercial (61); o lojista já entende este formato. |
| "de 12× R$ 299,99" riscado | Anota | **Rejeitado** | Preço "de" fictício; viola FOODE-BRAND (sem de/por) e confiança. |
| Faixa amarela "Até R$ 270 OFF, finaliza em 7 dias" | Anota (painel) | **Rejeitado** | Urgência artificial, recorrente. Anti-padrão. |
| Selo "Você começa aqui" na faixa inicial | Anota | **Adotado** | Reduz a ansiedade "vou pagar 254,99?". |
| "Sem fidelidade · Cancele quando quiser" sob o CTA | Anota | **Adotado** | Microgarantia honesta. |
| Teste grátis 7 dias sem cartão | Anota, Goomer | **Rejeitado (decisão 61)** | Sem trial; substituir por "onboarding acompanhado". |
| "Junte-se a +50 mil lojas" com logos | Anota | **Adaptado** | Só com números reais e locais; preferir "Lojas na sua cidade". |
| Abas Automação / Vendas / Gestão | Anota | **Rejeitado** | Esconde conteúdo atrás de clique; bento grid mostra tudo. |
| FAQ de planos no próprio painel | Anota | **Adotado na landing** | As quatro perguntas de 72/73 (formas de pagamento, fidelidade, pré-pago, renovação) viram FAQ pública. |
| Preço oculto, orçamento sob consulta | Goomer | **Rejeitado** | Transparência é diferencial da Foode; preço público reduz leads desqualificados. |
| Números com "até X%" | Goomer, Anota | **Adaptado** | Só com dado medido no funil próprio (decisão 63 P-REL-4); antes disso, números de mercado com fonte. |
| Dor antes da solução, gráfico de margem | Delivery Direto | **Adotado** | Seção 2.4; enquadra como "parar de perder margem". |
| "Para quem é" por nicho | Delivery Direto, Goomer | **Adotado** | Seção 2.7 + páginas de segmento. |
| Mockup de pedidos chegando "agora / 12 s" | Delivery Direto | **Adaptado** | Fila real do Painel animada com dados fictícios na tela, sem simular tempo real falso; rotular "exemplo". |
| Comparar mensalidade ao custo de ~30 pedidos de comissão | Delivery Direto | **Adotado** | "R$ 84,99 é menos que a comissão de 6 pedidos de R$ 60." (calcular com a faixa escolhida em `[Q-conteudo-2]`). |
| Garantias (uptime, LGPD, suporte horário) | Delivery Direto | **Adaptado** | Só o que a Foode cumpre: Cloudflare, LGPD, suporte humano no horário X `[Q-conteudo-4]`. Sem "99,9%" sem SLA. |
| Chat flutuante WhatsApp no canto | Anota, Goomer | **Em aberto** | `[Q-cta-3]`. |
| Popup de saída, barra de cookies agressiva | Goomer | **Rejeitado** | Sem popups; cookies só se houver analytics com consentimento. |
| Blog + páginas por nicho | Delivery Direto | **Adaptado** | Páginas de segmento sim; blog é pergunta ([PROPOSTA-SEO](PROPOSTA-SEO.md)). |

## 4. Direção de motion e visual (decidido pelo Dono; não vira pergunta)

### 4.1 Regras obrigatórias (valem para toda a página)

1. **`prefers-reduced-motion: reduce`** → toda animação de entrada vira estado final estático; parallax e scrollytelling viram layout empilhado normal; microinterações mantêm só mudança de cor/borda. Nenhuma informação ou CTA depende de motion.
2. **Nada bloqueia conteúdo nem CTA:** elementos nascem visíveis para quem não roda JS (`opacity: 1` por padrão; a classe `.js` ativa o estado inicial animado). O CTA do hero nunca anima para fora da dobra.
3. **Zero layout shift:** toda imagem e mockup com `width/height` ou `aspect-ratio` reservado; mockups de celular em container de proporção fixa (9/19.5); fontes com `font-display: swap` e `size-adjust` do fallback.
4. **Animar só `transform` e `opacity`** (compositor); nunca `top/left/height/box-shadow/filter`. `will-change` só no elemento sticky do scrollytelling, removido depois.
5. **Core Web Vitals verdes no mobile:** LCP = texto do H1 ou primeiro mockup (imagem `priority`, AVIF/WebP, ≤ 120 KB); INP < 200 ms (IntersectionObserver passivo, sem listeners de `scroll` síncronos); CLS < 0,1.
6. **Identidade Foode:** outline 1 px, sem shadow, sem glow, sem gradientes de fundo; a "profundidade" do parallax vem de deslocamento e escala, não de sombra. Primary em bordas/ícones; `--color-primary-strong` em fundos com texto.
7. Durações 200–600 ms; easing padrão `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out suave); stagger 60–80 ms entre irmãos, máximo 6 itens por grupo.

### 4.2 Técnica

- **Base: CSS + `IntersectionObserver`** (um observer, `threshold: 0.2`, `rootMargin: 0 0 -10% 0`, `unobserve` após entrar). Classe `.is-in` ativa `transition`/`animation`. Peso ~1 KB.
- **Parallax:** `animation-timeline: scroll()` / `view()` (CSS Scroll-Driven Animations) com fallback para estado estático onde não suportado; sem biblioteca.
- **Scrollytelling do "Como funciona":** `position: sticky` + observer por passo trocando a tela ativa (crossfade `opacity` + `translateY 12px`).
- **Contadores de números:** `requestAnimationFrame` só quando visível, 800 ms, desligado com reduced-motion (mostra valor final).
- **View Transitions API** só para a navegação entre páginas públicas (preços, segmentos): crossfade padrão 200 ms; é progressivo, zero custo onde não existe.
- **Biblioteca** (Motion One/GSAP) **não** se justifica: tudo acima cabe em CSS + ~3 KB de JS. Reavaliar só se o Dono pedir efeito 3D/canvas.

### 4.3 Por seção

| Seção | Efeito | Gatilho | Duração / easing | Estático (reduced-motion) |
| --- | --- | --- | --- | --- |
| Header | Hairline inferior aparece; logo encolhe 120→96 px (`transform: scale`) | `scrollY > 8` | 200 ms ease-out | Hairline sempre visível |
| Hero — texto | Eyebrow, H1, sub, CTAs entram com `opacity 0→1` + `translateY 16px→0`, stagger 70 ms | Load (após `DOMContentLoaded`) | 500 ms | Visível de imediato |
| Hero — mockups | Celular (frente) `translateY 24→0` + `scale 0.96→1`; Painel (atrás) `translateX 24→0`, 120 ms depois. Depois, **parallax em camadas** ao rolar: celular `translateY(-6%)`, Painel `translateY(-12%)` e fundo (foto de comida desfocada, 12% opacidade) `translateY(-3%)` via `animation-timeline: scroll()` | Load + scroll | 600 ms entrada; parallax linear | Camadas na posição final |
| Hero — CTA | Hover: borda e fundo trocam para `--color-primary-active`, ícone seta `translateX 2px`; active `scale 0.98`; focus-visible `outline 3px primary-soft` | Hover/focus | 150 ms | Mesma cor, sem translate |
| Faixa de prova | Chips entram da esquerda com stagger; logos de Lojas em marquee CSS lento (60 s, pausa no hover) | Entrar na viewport | 400 ms | Sem marquee; grid estático |
| Dor vs. Canal | Barras crescem `scaleX 0→1` (`transform-origin: left`); número final conta de 0 ao valor | Entrar na viewport (uma vez) | 700 ms ease-out; contador 800 ms | Barras cheias, números finais |
| Como funciona | Coluna de texto rola; mockup direito **sticky** troca tela: imagem anterior `opacity 1→0`, nova `opacity 0→1 + translateY 12→0`; passo ativo ganha borda primary e número preenchido | Observer por passo (`threshold 0.5`) | 350 ms | Três blocos texto+imagem empilhados, sem sticky |
| Funcionalidades (bento) | Cards entram `opacity + translateY 12px` com stagger 60 ms; hover: borda primary + ícone `scale 1.08`; miniaturas internas com leve `translateY(-4px)` no hover | Entrar na viewport / hover | 400 ms / 180 ms | Visíveis; hover só muda a borda |
| Para quem | Chips com stagger; hover troca fundo para `primary-soft` | Viewport / hover | 300 ms | Estático |
| Preços | Cards entram em par (esquerda/direita `translateX ∓16px`); selo accent "Pedidos ilimitados" com um único `scale 0.9→1` 200 ms depois; alternar faixa destacada ao hover da linha | Viewport | 450 ms | Cards no lugar, selo visível |
| Comparativo | Linhas entram uma a uma (stagger 50 ms, máx. 8); coluna Foode com borda primary pulsando **uma vez** (`scale 1→1.01→1`) | Viewport | 400 ms | Tabela estática |
| Depoimentos | Crossfade entre cards a cada 8 s, só se mais de 1 e sem reduced-motion; pausa no hover/focus; botões prev/next acessíveis | Timer | 400 ms | Lista completa visível |
| FAQ | `<details>` com `grid-template-rows 0fr→1fr` (animável sem altura fixa); chevron `rotate 180°` | Click | 250 ms | Abre sem animação |
| CTA final | Fundo primary-strong entra com `clip-path: inset(0 0 100% 0 → 0)`; texto + botão com stagger | Viewport | 500 ms | Fundo e texto já visíveis |
| Footer | Sem animação | — | — | — |

### 4.4 Estruturas de layout por seção

- **Hero:** grid assimétrico 5/7 com os mockups extravasando o container à direita (`overflow: clip` no body da seção, nunca scroll horizontal).
- **Dor vs. Canal:** faixa assimétrica 5/7 invertida (texto à direita) para quebrar ritmo.
- **Como funciona:** 2 colunas 5/7, direita sticky (`top: 96px`), altura do mockup 70vh máx.
- **Funcionalidades:** bento grid 12 col (7+5 / 4+4+4), gap 16 px; no mobile, 1 col com os dois cards maiores primeiro.
- **Preços:** 2 cards iguais de largura máxima 880 px centralizados.
- **Comparativo:** tabela full-width dentro de `OutlineContainer`; coluna Foode com `background: primary-soft` leve (único fill de tabela permitido).
- **Mockups:** moldura de celular e notebook desenhada em CSS (borda 1 px hairline, cantos `--radius-container`), sem imagem de device com sombra; a tela é uma captura real do produto exportada em AVIF/WebP em 2 tamanhos (`srcset`).

### 4.5 Assets necessários

Capturas reais (não mockups desenhados) do: Storefront (cardápio com Destaques; item com complementos; checkout; página do Pedido), Painel (fila; detalhe do Pedido com "Imprimir"; Cardápio; Cupom; Relatórios; tela Plano com faixa). Gerar a partir de uma Loja-modelo com dados fictícios rotulados (nomes de itens genéricos, sem telefone/endereço real). Fotos de comida só como fundo ≤ 15% opacidade.

## 5. CTA principal: WhatsApp vs. formulário (resumo da análise; decisão em `[Q-cta-1]`)

| | WhatsApp (`wa.me` com texto pré-preenchido + UTM na mensagem) | Formulário curto (nome, WhatsApp, Loja, cidade, pedidos/dia) |
| --- | --- | --- |
| Fricção | Mínima no celular; no desktop abre WhatsApp Web | Baixa; 4–5 campos |
| Qualificação | Depende da conversa | Automática (pedidos/dia, cidade) |
| Rastreio | Só pelo texto da mensagem | Evento de conversão limpo + origem (UTM) |
| Horário | Resposta humana; fora do horário o lead espera | Resposta automática "no mesmo dia útil" |
| Infra | Zero | Rota na `api` + Turnstile (já existem) + e-mail pela MillionSend ou gravação em D1 |
| Risco | Número pessoal exposto; a decisão 64 tirou `wa.me` de **suporte** no Painel, mas não da venda | Formulário sem resposta rápida mata o lead |

Recomendação: **formulário curto como primário** no hero e no CTA final, com link secundário "ou chame no WhatsApp" — captura rastreável e o canal preferido do ICP como atalho. Ver [PERGUNTAS-LANDING.md](PERGUNTAS-LANDING.md).

## 6. Impacto esperado (ordem)

1. Preço correto e público por faixa (hoje a página vende R$ 179).
2. CTA rastreável (formulário/WhatsApp) em vez de `mailto:`.
3. Telas reais do produto em hero e "como funciona".
4. Seção "dor vs. canal próprio" com números.
5. FAQ + comparativo tratando objeções (e alimentando SEO).
