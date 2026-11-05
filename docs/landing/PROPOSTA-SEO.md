# Proposta — páginas públicas e SEO técnico

**Data:** 2026-11-05 · **Status:** proposta · **Depende de:** [decisão 15](../decisoes/15-url-slug-e-marca-provisional.md) (`/loja/[slug]`), [40](../decisoes/40-marketing-no-apps-web.md) (marketing no `apps/web`), [05](../decisoes/05-escopo-geografico-e-gtm-local.md) (GTM local; SEO nacional não é motor principal no dia 1), [14](../decisoes/14-descoberta-link-e-diretorio-parceiros.md) (sem diretório no MVP).

Premissa: SEO aqui é **higiene e cauda longa local**, não o motor de aquisição (decisão 05). O retorno vem de (a) previews corretos no WhatsApp, (b) ranquear o próprio nome e "alternativa a X", (c) páginas de preço/segmento que a venda consultiva usa como material.

## 1. Mapa de páginas públicas

| Rota | Título (`<title>`) | Objetivo | Prioridade |
| --- | --- | --- | --- |
| `/` | Foode Delivery — Cardápio digital e pedidos sem comissão | Landing principal ([PROPOSTA-LANDING](PROPOSTA-LANDING.md)) | P0 |
| `/precos` | Preços — Foode Delivery | Faixas, anual, taxas de pagamento, inclusos, FAQ de plano. Conteúdo da seção 2.8 expandido; é a página que a venda envia | P0 |
| `/como-funciona` | Como funciona — Foode Delivery | 3 passos + fluxo do Consumidor e do Dono com telas; link para Loja-modelo | P1 |
| `/para/[segmento]` | Cardápio digital para hamburgueria — Foode Delivery | 6–8 páginas de segmento (hamburgueria, pizzaria, marmitaria, acai, japones, padaria, lanches, bebidas). Mesmo template, copy e tela por nicho | P1 `[Q-paginas-2]` |
| `/contato` | Fale com a Foode | Formulário + WhatsApp + e-mail; destino canônico de todo CTA | P0 |
| `/termos` | Termos de uso | Lojista e Consumidor (ou dois documentos) `[Q-paginas-3]` | P0 (legal) |
| `/privacidade` | Política de privacidade | Reescrever: cobre site, Storefront, Painel e lead | P0 (legal) |
| `/sobre` | Sobre a Foode | Quem é, cidade, CNPJ; sustenta `Organization` | P2 |
| `/loja/[slug]` | `{Loja} — Cardápio e pedidos` | Storefront (indexação em `[Q-paginas-1]`) | existente |
| `/cidades/[cidade]` | Delivery sem comissão em {Cidade} | Só quando houver ≥ 3 Lojas na cidade; lista as Lojas (não é diretório ranqueado: ordem alfabética, sem pagamento, decisão 14) | P3 `[Q-paginas-4]` |
| `/blog/*` | — | Não no MVP `[Q-conteudo-1]` | — |

Não criar: `/login` no `web` (Painel é `admin.`), `/cadastro` (não há self-serve), `/teste-gratis`.

Redirecionamentos: `www` → apex já existe (Ticket 25). Adicionar `/plano`, `/planos` → `/precos`; `/#plano` continua como âncora.

## 2. Metadados (Next `metadata` API)

No `layout.tsx` raiz:

```
metadataBase: https://foodedelivery.com.br
title: { default: "Foode Delivery — Cardápio digital e pedidos sem comissão", template: "%s · Foode Delivery" }
description (≤ 155): "Canal próprio para o seu delivery: cardápio digital, checkout com PIX e cartão, fila de pedidos e relatórios. Mensalidade por faixa de pedidos, sem comissão."
openGraph: { type: "website", locale: "pt_BR", siteName: "Foode Delivery", images: [{ url: "/og/default.png", width: 1200, height: 630, alt }] }
twitter: { card: "summary_large_image" }
robots: { index: true, follow: true }
alternates: { canonical: "/" } (por página)
icons: favicon.ico + icon.svg + apple-touch-icon 180 (gerar do logo)
```

- OG por página: `/precos` e segmentos com imagem própria (template `ImageResponse` do Next em `opengraph-image.tsx`, fundo canvas, logo, título, borda 1 px primary — mesma estética outline).
- Storefront `/loja/[slug]`: OG com logo quadrado e capa da Loja, descrição = descrição curta (decisão 63 P-VIS-3). Já é o preview que o lojista compartilha no WhatsApp: **a maior alavanca de SEO social do produto**.
- `/loja/[slug]/finalizar`, `/pedido/[token]`, `/carrinho`: `robots: noindex` (já parcialmente feito); `/contato` após envio: `noindex`.

## 3. `robots.txt` e `sitemap.xml`

`app/robots.ts`:

```
User-agent: *
Allow: /
Disallow: /loja/*/finalizar
Disallow: /loja/*/pedido/
Disallow: /loja/*/carrinho
Disallow: /api/
Sitemap: https://foodedelivery.com.br/sitemap.xml
```

`app/sitemap.ts`: estáticas (`/`, `/precos`, `/como-funciona`, `/contato`, `/termos`, `/privacidade`, `/sobre`, `/para/*`) com `lastModified` do build; Lojas `active` via `API` binding (rota pública `/storefront/sitemap` que devolve slugs + `updatedAt`), cacheada 1 h; se a decisão `[Q-paginas-1]` for "não indexar Storefront", omitir e adicionar `noindex` no `generateMetadata` da Loja. `admin.` e `api.` têm `robots.txt` próprio com `Disallow: /`.

## 4. Dados estruturados (JSON-LD, um `<script>` por tipo)

| Página | Tipo | Campos |
| --- | --- | --- |
| Todas | `Organization` | name, url, logo, sameAs (Instagram), contactPoint (WhatsApp/e-mail, `areaServed: BR`, `availableLanguage: pt-BR`) |
| `/`, `/precos` | `SoftwareApplication` | name, applicationCategory `BusinessApplication`, operatingSystem `Web`, `offers`: 4 `Offer` (3 faixas mensais + anual) com `price`, `priceCurrency: BRL`, `billingIncrement`/`eligibleQuantity` descrevendo a faixa; sem `aggregateRating` até existir avaliação real |
| `/`, `/precos`, segmentos | `FAQPage` | Mesmas perguntas visíveis na página (Google exige correspondência) |
| `/como-funciona` | `HowTo` | 3 passos | 
| `/loja/[slug]` | `Restaurant` ou `FoodEstablishment` | name, image, address (só com Retirada ativa, P-3.3), `servesCuisine` (perfil P-ONB-4), `menu: URL da própria página`, `acceptsReservations: false`, `potentialAction: OrderAction` | `[Q-paginas-1]` |
| `/cidades/[cidade]` | `ItemList` de `Restaurant` | — |
| Breadcrumb em segmentos/cidades | `BreadcrumbList` | — |

Validar com o Rich Results Test antes de ir ao ar; FAQ e Offer são os que geram rich snippet.

## 5. Canônicas e duplicidade

- `alternates.canonical` absoluto em toda página; `/para/[segmento]` canônica própria (conteúdo ≥ 40% diferente entre segmentos; se for só trocar o nome, não criar a página).
- Querystrings de UTM: canônica sem query (padrão do Next com `canonical` fixo).
- `/loja/[slug]/item/[id]` (item com URL própria, P-5.4): canônica para a página da Loja com `#item`, ou `noindex` — evitar milhares de páginas finas.
- Loja `onboarding`/`suspended`: `noindex` + 404/410 conforme o estado.

## 6. Storefront indexável ou não (`[Q-paginas-1]`)

| Indexar | Não indexar |
| --- | --- |
| Lojista ganha busca por "nome da loja cardápio" (muito comum) e o Google mostra o canal próprio em vez do marketplace; `Restaurant` JSON-LD; conteúdo de verdade para o domínio | Sem risco de página fina/duplicada antes de o Storefront ter descrição e capa; sem exposição de Loja que não quer aparecer |

Recomendação: indexar Lojas `active` com descrição ≥ 60 caracteres e logo; `noindex` nas demais. Opt-out por Loja em configuração (campo `seo_index`, default true) — item pequeno para o Ticket 28.

## 7. Performance e Core Web Vitals (metas mobile, P75)

| Métrica | Meta | Como |
| --- | --- | --- |
| LCP | ≤ 2,0 s | H1 texto como LCP preferencial; mockup do hero `priority`, AVIF/WebP ≤ 120 KB, `sizes` correto; `fetchpriority=high`; sem `100dvh` de foto |
| CLS | < 0,05 | `aspect-ratio` em todo mockup; fontes `font-display: swap` + `size-adjust`; header altura fixa; nada injetado acima da dobra |
| INP | < 200 ms | Sem `scroll` listener; IO + CSS scroll-driven; `<details>` nativo; Turnstile carregado só no `/contato` ou no foco do formulário |
| TTFB | < 500 ms | Páginas estáticas (SSG/ISR no OpenNext, cache no Worker); `/sitemap` ISR 1 h |
| Peso JS inicial | ≤ 90 KB gz | Landing sem client components além do menu mobile, observer e formulário |
| Fonte | 1 arquivo | Nunito variável subset `latin` só eixo `wght` (`@fontsource-variable/nunito/wght.css` + `unicode-range`) e `preload` |
| Imagens | AVIF/WebP | Ativar `images` no `next.config.ts` com o loader do Cloudflare Images (binding `IMAGES` já declarado) ou pré-exportar estáticos em 2 tamanhos |

Acessibilidade mínima: skip link, landmarks nomeados, contraste ≥ 4,5:1 (texto sobre primary só com `--color-primary-strong`), foco visível, `<details>` para FAQ, alvos ≥ 44 px, `lang="pt-BR"`, `alt` real nas telas ("Fila de pedidos do Painel com dois pedidos em preparo").

## 8. Medição

- Core Web Vitals: Search Console (dados de campo) + Lighthouse CI no PR da landing (orçamentos: LCP 2,5 s, CLS 0,1, peso 300 KB) como job leve em `ci.yml` só quando `apps/web/src/app/(marketing)/**` mudar.
- Conversão: eventos `cta_click` (origem: hero/precos/final/header), `lead_submit`, `whatsapp_click`; ferramenta em `[Q-conteudo-5]` (sem cookie: Cloudflare Web Analytics ou Plausible; com cookie exige banner).
- Rastreio de campanha: UTM na URL → campo oculto `source` no formulário → gravado com o lead; no WhatsApp, o texto pré-preenchido leva o código da origem.
- Search Console + Bing Webmaster: verificar o domínio por DNS TXT (zona já na Cloudflare).

## 9. Organização no código (sugestão, não prescrição)

`apps/web/src/app/(marketing)/` com `layout.tsx` próprio (header/footer da landing), páginas acima, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts`; conteúdo (preços, FAQ, segmentos) num módulo `content/*.ts` tipado, com os valores das faixas lidos de `@foode/shared` (fonte única também usada pelo Painel/Plano e pelo teste), para a landing nunca mais divergir da decisão vigente.
