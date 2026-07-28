# Pesquisa: stack frontend de concorrentes (cardápio digital BR)

**Data:** jul/2026 · **Tipo:** pesquisa técnica / benchmark de implementação (não é decisão)

**Escopo:** Anota AI, Goomer, InstaDelivery, MenuDino/Consumer, Cardápio Web e padrões do segmento SaaS de canal próprio.

**Limite metodológico (importante):** BuiltWith/Wappalyzer/W3Techs costumam enxergar o **site de marketing** (WordPress, jQuery, tags), não o app autenticado do lojista nem o cardápio do cliente. Frameworks SPA (React/Angular/Vue) embutidos em apps atrás de login raramente aparecem. Preferir: vagas, LinkedIn de engenharia, blogs oficiais, desafios de entrevista, declarações públicas do produto. O que for **inferência** está marcado.

---

## Síntese rápida

| Player | Cliente (pedido) | Lojista | Stack frontend aparente | Confiança |
| --- | --- | --- | --- | --- |
| **Anota AI** | Cardápio web + WhatsApp + app garçom | Web admin (`admin.anota.ai`) | **Angular** (gestão) + **Vue 2** (catálogo digital, histórico); Ionic citado em vagas | Alta (vagas + LinkedIn engenharia) |
| **Goomer** | Web delivery + tablet + QR + totem | Painel web multi-loja | **React** (+ Redux/saga/styled); legado **Ractive.js**; Next.js como diferencial em vagas | Alta (vaga + desafio oficial) |
| **InstaDelivery** | Cardápio via link web | Web + app Android/iOS + software Windows (impressão) | Marketing: **Nuxt/Vue** (W3Techs em subdomain); produto: **React** (perfil LinkedIn interno — fraco) | Média |
| **MenuDino / Consumer** | Site delivery **100% web** (sem app obrigatório) | **Consumer Desktop (PDV)** + fila de pedidos; apps white-label opcionais | Stack FE do site **não publicada**; customizações de terceiros usam Next.js estático | Baixa (só produto público) |
| **Cardápio Web** | Cardápio digital web (delivery/mesa/balcão) | Painel web responsivo; “tempo real” no discurso comercial | Stack FE **não identificada** publicamente | Baixa |
| **Padrão do segmento** | Mobile-first web / PWA; app nativo cliente raro | Web + às vezes desktop/Android lojista | React ou Angular/Vue SPA; PWA > app store no MVP | Inferência de mercado |

---

## Por concorrente

### Anota AI

**Fato público (produto)**
- Canal forte em **WhatsApp + cardápio digital + QR mesa + PDV/balcão + app garçom**.
- Painel web: [admin.anota.ai](https://admin.anota.ai/).
- Site institucional: WordPress/Elementor/jQuery (W3Techs) — **não** reflete o app.

**Fato público (engenharia)**
- Vaga FE júnior: Angular 2+, SPA, Angular Material / Bootstrap / **Ionic** ([Freshteam](https://anota-ai.freshteam.com/jobs/JfbcpbW8FyuM/analista-junior-front-end)).
- LinkedIn da empresa lista: Angular, Angular Material, TypeScript, Jasmine, Playwright ([company page](https://br.linkedin.com/company/anotaaibots)).
- Lead FE (perfil LinkedIn): catálogo digital em **Vue 2**; app de gestão em **Angular + TypeScript**.

**Inferência**
- Cliente do cardápio: SPA/mobile web (não há evidência forte de SSR Next no cardápio).
- App garçom: possível **Ionic/Capacitor** ou webview — só diferencial de vaga, não confirmação de produção.
- Backend citado em vagas: Node/TS, MongoDB, mensageria — fora do escopo FE, mas sugere APIs REST + eventual realtime (WebSocket citado em perfil de engenharia).

**Fontes:** [anota.ai/home](https://anota.ai/home/), [W3Techs anota.ai](https://w3techs.com/sites/info/anota.ai), vaga Freshteam, LinkedIn company/engineering.

---

### Goomer

**Fato público (produto)**
- Omnichannel: **delivery web**, **tablet**, **QR Code**, **totem**; integração PDV/KDS; painel multi-loja; “dados em tempo real” no marketing ([goomer.com.br](https://goomer.com.br/), [Tablet 2.0](https://goomer.com.br/blog/tablet-2-0-goomer), [Delivery 2.0](https://goomer.com.br/blog/delivery-2-0-goomer)).
- Cliente **não precisa** de app de loja para pedir no delivery/QR — experiência browser/tablet/totem.

**Fato público (engenharia)**
- Desafio de contratação (histórico): “aqui na Goomer usamos **React** e **Ractive.js**”.
- Vaga FE 2022: React, Redux, Redux-saga, Styled-components, Jest/RTL; diferencial **Next.js (SSR)** e Cypress ([frontendbr/vagas#6250](https://github.com/frontendbr/vagas/issues/6250)).
- LinkedIn company: JavaScript, GraphQL entre ferramentas listadas (lista ampla — tratar como sinal, não inventário completo).

**Inferência**
- Cardápio/autoatendimento: SPA React responsiva (mobile-first no delivery/QR).
- SSR/Next: desejável para SEO do delivery, mas **não confirmado** como stack atual do produto.
- Totem/tablet: provavelmente mesmo front web empacotado (kiosk), não apps nativos separados por plataforma.

**Fontes:** site/blog Goomer, vaga frontendbr, menção no desafio goomerdev (repositório histórico).

---

### InstaDelivery

**Fato público (produto)**
- Cardápio digital por **link** + painel **web sem instalação** ([blog versão web](https://blog.instadelivery.com.br/versao-web-sistema-instadelivery/)).
- Lojista também: **app Android/iOS** ([Play Store](https://play.google.com/store/apps/details?id=br.com.instadelivery.lojista)) e **software Windows** para impressão automática de comandas.
- QR mesa, PDV web, pedidos em colunas (Recebidos/Aceitos/Prontos).

**Sinais de stack (mistos)**
- W3Techs em `instadelivery.com.br`: WordPress no marketing; **Nuxt.js** em subdomain; Bootstrap/jQuery; Node.js em subdomain ([W3Techs](https://w3techs.com/sites/info/instadelivery.com.br)).
- Perfil LinkedIn de colaborador (suporte/dev): React.js + Node — **evidência fraca** (um CV, pode ser interno/ferramentas).

**Inferência**
- Cliente: web mobile-first (link compartilhável).
- Lojista: web app + wrappers nativos/desktop para impressão e push — padrão comum no BR.
- Nuxt detectado no domínio não prova que o cardápio do cliente seja Vue; pode ser landing/subproduto.

**Fontes:** blog InstaDelivery, Play Store, W3Techs.

---

### MenuDino / Consumer

**Fato público (produto)**
- Cardápio **100% web** — cliente não baixa app ([consumer.com.br/menudino](https://consumer.com.br/menudino/), [FAQ](https://consumer.com.br/cardapio-digital)).
- Pedidos: WhatsApp (grátis) ou **Consumer PDV Desktop** (Premium); fila de pedidos; banda larga permanente no PC do lojista ([ajuda Consumer](https://ajuda.programaconsumer.com.br/como-receber-pedidos-do-menudino-no-consumer-desktop/)).
- App **MenuDino** na Play/App Store é **marketplace/descoberta** de restaurantes, não o cardápio white-label do lojista.
- White-label Android/iOS por loja existe no ecossistema Consumer (docs de publicação).
- Integração parceiros: API + **polling** de eventos ([ajuda API parceiro](https://ajuda.programaconsumer.com.br/integracao-api-do-parceiro/)) — sinal de que “tempo real” do PDV pode ser poll, não só WebSocket.

**Stack frontend**
- **Não há declaração oficial** React/Vue/Angular do site delivery.
- Repo de terceiro (customização de loja): Next.js + assets SCSS/JS estáticos ([monecchi/meuranchomenudino](https://github.com/monecchi/meuranchomenudino)) — **não** é o core MenuDino.

**Inferência**
- Site delivery: webapp/SPA ou páginas dinâmicas mobile-first.
- Operação lojista centrada em **desktop PDV**, não em painel SaaS browser-only (diferente de Anota/Goomer/Insta).

---

### Cardápio Web

**Fato público (produto)**
- Suite: cardápio digital (delivery/mesa/balcão), chatbot WhatsApp, KDS, relatórios “em tempo real”, plataforma **online e responsiva** ([cardapioweb.com](https://cardapioweb.com/), [sistema delivery](https://cardapioweb.com/sistema-para-delivery-cw/)).
- Posicionamento próximo a Anota (automação WhatsApp + cardápio + gestão).

**Stack frontend**
- **Não encontrada** em vagas públicas, blog de engenharia ou detecção confiável do app.
- W3Techs/BuiltWith no domínio de marketing não foram úteis para framework SPA do produto.

**Inferência**
- Mesmo padrão do segmento: web mobile para cliente; painel web para lojista; “tempo real” = marketing (polling ou WS — não verificado).

---

## Padrões de cardápio / checkout (segmento)

| Padrão | Observação | Tipo |
| --- | --- | --- |
| **Mobile-first web** | Quase todos: link/QR no celular, sem App Store obrigatória | Fato de produto |
| **PWA / “instalar na tela”** | Comum em players menores (Delivra, NexFood, Expresso Delivery) e discurso de mercado; nos big 5, nem sempre anunciado como PWA | Misto |
| **SPA no cardápio** | Navegação por categorias, carrinho, opcionais, checkout — comportamento típico de SPA | Inferência forte |
| **SSR/SEO** | Útil para domínio próprio e Google; Goomer citou Next como diferencial de vaga; pouco evidência de SSR agressivo no cardápio | Inferência |
| **Checkout leve** | Cadastro simplificado / pedido sem login completo (ex.: MenuDino) | Fato (docs) |
| **WhatsApp como canal** | Cardápio linkado ou bot monta pedido; FE do cardápio ainda é web | Fato |
| **Performance** | Fotos pesadas + mobile 3G/4G BR → lazy load, CDN, WebP (Anota marketing usa WebP no site) | Inferência + sinal |

---

## Painel do lojista: web vs nativo vs realtime

| Player | Forma principal | Realtime? |
| --- | --- | --- |
| Anota AI | Web admin | Marketing + WebSocket em perfis de eng. — **parcialmente confirmado** |
| Goomer | Painel web multi-loja | “Tempo real” no marketing; GraphQL no LinkedIn — **não prova subscriptions** |
| InstaDelivery | Web + apps lojista + Windows | Pedidos na UI web; impressão via app desktop |
| MenuDino | **Consumer Desktop** + monitor/fila | Docs enfatizam PC ligado; API parceiro usa **polling** |
| Cardápio Web | Painel web | “Relatórios em tempo real” — **marketing** |

**Padrão MVP do mercado:** painel web com lista de pedidos que atualiza sozinha (poll 3–10s ou WS). App nativo lojista e impressão térmica entram depois.

---

## Limites de BuiltWith / detecção automática

1. Mede sobretudo **homepage/marketing**, não `admin.*` nem subdomínios de cardápio por loja.
2. SPAs minificadas sem fingerprints claros → “JavaScript genérico”.
3. Cloudflare/CDN esconde stack de origem.
4. Listas LinkedIn “Tech Stack” misturam ferramentas de marketing, infra e código — **ruído alto**.
5. Conclusão segura só com **2+ fontes** (ex.: vaga + perfil de eng. + produto).

---

## Implicações para MVP solo / founder

1. **Não copiar stack enterprise.** Anota (Angular + Vue legado) e Goomer (React + Redux + totens/PDV) são times grandes. Solo founder ganha com **um** framework e um deploy.
2. **Cliente = web mobile-first (PWA opcional).** App nativo do consumidor é custo sem ROI no início — alinhado a MenuDino/Goomer delivery/QR.
3. **Lojista = web app de pedidos primeiro.** Desktop Windows / impressão automática / app lojista (como InstaDelivery) são fase 2.
4. **React/Next ou Vue/Nuxt** bastam e batem o mercado; Angular só se já for expertise do founder. SSR ajuda SEO do domínio da loja, mas **SPA rápida no celular** importa mais que TTFB perfeito no dia 1.
5. **Realtime “de verdade” (WS) não é bloqueante.** Polling no painel (padrão Consumer/API) entrega MVP; WebSocket quando volume/impressão/KDS exigirem.
6. **Separar marketing site do produto** (como todos fazem): landing pode ser qualquer coisa; app e cardápio devem ser o núcleo.
7. **Escopo FE mínimo viável:** cardápio + carrinho + checkout (PIX/endereço) + painel de pedidos + CRUD cardápio. Totem, tablet kiosk, app garçom, white-label store — **depois**.

---

## Fontes (lista)

- Anota: [anota.ai](https://anota.ai/home/), [admin.anota.ai](https://admin.anota.ai/), [vaga FE](https://anota-ai.freshteam.com/jobs/JfbcpbW8FyuM/analista-junior-front-end), [LinkedIn Anota AI](https://br.linkedin.com/company/anotaaibots), [W3Techs](https://w3techs.com/sites/info/anota.ai)
- Goomer: [goomer.com.br](https://goomer.com.br/), [vaga FE](https://github.com/frontendbr/vagas/issues/6250), blogs Tablet/Delivery 2.0
- InstaDelivery: [blog versão web](https://blog.instadelivery.com.br/versao-web-sistema-instadelivery/), [Play Store](https://play.google.com/store/apps/details?id=br.com.instadelivery.lojista), [W3Techs](https://w3techs.com/sites/info/instadelivery.com.br)
- MenuDino/Consumer: [consumer.com.br/menudino](https://consumer.com.br/menudino/), [ajuda pedidos](https://ajuda.programaconsumer.com.br/como-receber-pedidos-do-menudino-no-consumer-desktop/), [API parceiro](https://ajuda.programaconsumer.com.br/integracao-api-do-parceiro/)
- Cardápio Web: [cardapioweb.com](https://cardapioweb.com/)
- Contexto PWA do segmento: Delivra, NexFood, Expresso Delivery (sites públicos, jul/2026)
