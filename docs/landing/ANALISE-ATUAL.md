# Análise da landing atual (`foodedelivery.com.br`)

**Data:** 2026-11-05 · **Fonte:** `apps/web/src/app/page.tsx`, `layout.tsx`, `globals.css`, `privacidade/page.tsx`, `page.test.tsx` · **Escopo:** rotas públicas fora de `/loja/*`.

Documentos irmãos: [PROPOSTA-LANDING.md](PROPOSTA-LANDING.md) · [PROPOSTA-SEO.md](PROPOSTA-SEO.md) · [PERGUNTAS-LANDING.md](PERGUNTAS-LANDING.md).

## 1. O que existe hoje

Uma página única (`/`) com 6 blocos, mais `/privacidade` (texto provisório) e `/api/health`:

| # | Bloco | Conteúdo |
| --- | --- | --- |
| 1 | Header 72 px | Logo (132 px, `priority`), link "Como funciona" (oculto no mobile), botão "Ver plano" |
| 2 | Hero (`min-h: 100dvh − 72px`) | Eyebrow "Feito para delivery local", H1 "Seu Canal próprio. Sua Loja mais perto.", sub "Cardápio, pedidos e gestão em um só lugar…", CTA "Começar com a Foode" → `#plano`, "A partir de R$ 179/mês", foto stock de comerciante |
| 3 | Benefícios | `OutlineContainer` com H2 "Venda direto, sem comissão por pedido." + 3 bullets |
| 4 | Como funciona | 3 cards outline: Divulgue seu link · Receba pelo navegador · Organize no Painel |
| 5 | Plano | Card Mensal R$ 179 / Anual R$ 1.718,40 "20% OFF" + CTA `mailto:contato@foodedelivery.com.br` |
| 6 | Rodapé | Logo compacto + "Canal próprio para delivery local." |

Metadados: `title` "Foode Delivery \| Seu canal próprio", `description` genérica, `lang="pt-BR"`. Sem Open Graph, sem `metadataBase`, sem `robots.txt`, sem `sitemap.xml`, sem dados estruturados, sem favicon declarado, sem `/termos`.

Identidade: tokens da marca corretos (Nunito, primary `#F35050`, outline sem shadow, canvas branco). O `page.test.tsx` fixa R$ 179 / R$ 1.718,40 / 20% OFF.

## 2. Problemas

### 2.1 Conteúdo e decisões desatualizadas (bloqueante)

- **Preços superseded.** R$ 179/mês e R$ 1.718,40 "20% OFF" foram revogados pela [decisão 61](../decisoes/61-monetizacao-faixas-taxas-anota.md): faixas por Pedidos R$ 84,99 / 169,99 / 254,99 e anual 12× R$ 84,99. A landing está prometendo um preço mais do dobro do vigente e o teste de componente trava o valor errado.
- "Ver plano" (singular) e "Um plano direto para começar" contradizem o modelo por faixas.
- Não menciona o que diferencia o pacote fechado nas decisões 60–62: PIX e cartão online com taxa Foode, repasse D+1 útil, cupons, impressão 80 mm, aviso por WhatsApp, Pixel Meta/Google, relatórios, funil.
- "Sem comissão por pedido" aparece como H2 de um bloco secundário; a [decisão 01](../decisoes/01-tipo-produto-saas-canal-proprio.md) já avisa que "0% sobre pedido é higiene de mercado, não diferencial sozinho" — a página não diz qual é o diferencial (custo previsível + canal próprio + pagamento online + onboarding acompanhado, [05](../decisoes/05-escopo-geografico-e-gtm-local.md)).

### 2.2 Conversão (CRO)

- **CTA sem destino real.** "Começar com a Foode" e "Ver plano" só rolam até `#plano`; o único CTA de contato é um `mailto:`, que no celular abre (ou não) um app de e-mail e perde o lead. Nenhum caminho WhatsApp, nenhum formulário, nenhum rastreamento de origem.
- Um só CTA primário por dobra, mas o CTA final está dentro do card de plano, abaixo do preço: quem não decidiu pelo preço não tem saída "tirar dúvida".
- **Zero prova social**: sem número de Lojas, sem depoimento, sem logo, sem tela real do produto (a foto do hero é stock e não mostra o produto). O ICP ([02](../decisoes/02-publico-icp-pme-delivery.md)) já opera delivery e compara com Anota/Goomer; precisa ver o Storefront e o Painel.
- Não trata objeções (migração do cardápio, prazo de ativação, cancelamento, taxas de pagamento, "preciso de computador?", "e o iFood?"). Sem FAQ.
- Hero ocupa `100dvh` com uma foto que não explica nada; no mobile o primeiro scroll inteiro é foto.
- Faltam âncoras e links de navegação (o header não leva a preços, FAQ, contato); no mobile a nav some.
- Nada "para quem é": o visitante não se identifica (hamburgueria, pizzaria, marmitaria, açaí, sushi, padaria).

### 2.3 UX e acessibilidade

- Hierarquia tipográfica monótona: H1 `1.75rem` igual aos H2 (`1.75rem`) — não há escala entre hero e seções ([FOODE-BRAND](../FOODE-BRAND.md) pede hierarquia modesta, mas ainda hierarquia).
- "Como funciona" desoculto no mobile só por link invisível (`hidden sm:block`): sem menu mobile.
- Badge "20% OFF" com texto ink sobre accent `#FFB800`: ok de contraste, mas o accent está marcando um desconto que não existe mais.
- Botões como `<a href="#…">`: focáveis, mas `scroll-behavior: smooth` sem respeitar foco (há `prefers-reduced-motion`, bom).
- Imagem do hero com `alt` descritivo (bom). Logo com `alt="Foode Delivery"` repetido em header e rodapé (aceitável).
- Sem skip link, sem landmarks `nav`/`footer` nomeados além do `aria-label` da nav principal (parcial).
- `/privacidade` é texto do Storefront ("quem pede"), não cobre o lojista nem o site; está marcada "provisória" em produção.

### 2.4 SEO

- Sem `metadataBase`, `openGraph`, `twitter`, `alternates.canonical`, `robots`. Compartilhar o link no WhatsApp (principal canal do ICP) não gera preview com imagem.
- Sem `sitemap.xml` / `robots.txt`; sem JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage`).
- Uma única página: zero cobertura de buscas de cauda ("cardápio digital sem comissão", "sistema de delivery próprio", "alternativa ao anota ai", "preço", "como funciona").
- H1 com termos internos ("Canal próprio", "Loja" em maiúscula do glossário) e não com a linguagem que o lojista pesquisa (cardápio digital, delivery próprio, sem comissão).
- `title` sem palavra-chave de categoria; `description` curta e genérica.

### 2.5 Performance

- Duas imagens `priority` acima da dobra (logo 132 px servido como PNG de logo, hero PNG) — `hero-restaurante.png` e `logo.png` são PNG; sem AVIF/WebP garantido pelo pipeline (OpenNext + binding `IMAGES` existe no `wrangler.jsonc`, mas não há `images` configurado no `next.config.ts`; validar se a otimização está ativa).
- Fonte Nunito variável importada inteira via `@fontsource-variable/nunito` (todos os eixos/sub-ranges); sem `font-display` explícito nem subset `latin` apenas.
- `@phosphor-icons/react/dist/ssr` é tree-shakeable (bom).
- `min-h-[calc(100dvh-72px)]` no hero + imagem `fill` reserva altura (CLS controlado). Bom.
- Sem Sentry client DSN definido (ok para agora).

### 2.6 Testes

- `page.test.tsx` fixa valores comerciais revogados. Ao mudar a landing, o teste deve consumir os valores de um contrato (`@foode/shared`) ou de um arquivo de conteúdo único, não literais.

## 3. O que vale manter

- Tokens de marca e estética outline (ADR 0005): base certa.
- Estrutura em `apps/web` ([decisão 40](../decisoes/40-marketing-no-apps-web.md)), rota `/loja/[slug]` isolada ([15](../decisoes/15-url-slug-e-marca-provisional.md)).
- Os três passos "link → navegador → Painel" são a espinha correta de "como funciona"; só precisam de telas reais.
- `prefers-reduced-motion` já tratado no CSS global.

## 4. Resumo por prioridade

| Prioridade | Problema |
| --- | --- |
| P0 | Preço revogado em produção e no teste |
| P0 | CTA de contato é `mailto:`; sem captação rastreável |
| P1 | Sem prova social nem telas do produto |
| P1 | Sem OG/canonical/sitemap/robots/JSON-LD |
| P1 | Sem FAQ, sem "para quem", sem comparativo vs. marketplace |
| P2 | Hierarquia tipográfica plana; nav mobile ausente |
| P2 | Imagens PNG, fonte sem subset |
| P2 | `/privacidade` provisória e só para o Consumidor; sem `/termos` |
