# Assets da landing (Ticket 31)

| Arquivo | Uso | Estado | Licença / origem |
| --- | --- | --- | --- |
| `apps/web/public/images/hero-food-placeholder.svg` | Fundo desfocado do hero (decisão 70) | **Placeholder vetorial — trocar** | Desenhado no repositório; sem terceiros |
| `apps/web/public/images/shot-storefront.webp` (720×1558, ~34 KB) | Tela do celular no hero, "Como funciona" e card do cardápio | Captura real | Gerada no repositório (abaixo) |
| `apps/web/public/images/shot-pedidos.webp` (1400×875, ~50 KB) | Tela do notebook no hero e no "Como funciona" | Captura real | Gerada no repositório (abaixo) |
| `apps/web/public/images/founder-placeholder.svg` (240×240) | Foto redonda na carta do fundador | **Placeholder neutro — trocar pela foto do Dono** (mesmas dimensões; `FOUNDER_PHOTO` em `founder.tsx`) | Desenhado no repositório |
| `public/images/logo.png` | Wordmark | Oficial | Marca Foode |
| `public/images/hero-restaurante.png` | Não usado na landing nova | Origem/licença não registrada: **não usar** até registrar | — |
| `public/images/mobile_ui.png`, `web_ui.png` | Referência de design, não usados | — | — |

## Como as capturas foram geradas (2026-11-05)

Capturas das páginas reais renderizadas pelo produto, com dados fictícios ("Burger do Bairro",
nomes de clientes inventados, sem telefone/endereço real), sem nenhuma imagem de terceiros:

1. **Storefront** (`shot-storefront.webp`): o componente real `Storefront` de
   `apps/web/src/app/loja/[slug]/storefront/storefront.tsx` renderizado numa página temporária
   do `next dev` com um `PublicMenu` montado a partir de `storefront/fixtures.ts` (3 categorias,
   7 itens sem foto) e `storeState` da fixture; carrinho semeado no `localStorage` com 2 itens
   para a barra "Ver carrinho" aparecer.
2. **Fila de Pedidos** (`shot-pedidos.webp`): `PainelShell` + `QueueBoard` reais do admin
   (`apps/admin/src/app/(painel)/pedidos/_components/queue-board.tsx`) com `loadList` em memória
   (5 Pedidos nas três colunas), faixa de som oculta.
3. Captura com o Chromium do Playwright já presente na máquina
   (`chrome-headless-shell --screenshot --force-device-scale-factor=2`), 390×844 para o celular
   e 1280×800 para o notebook; conversão para WebP (qualidade 82) com o `sharp` que o Next já
   traz. As páginas temporárias **não** foram commitadas.

As dimensões ficam fixas em `SHOTS` (`apps/web/src/components/marketing/mockups.tsx`) e as
molduras têm `aspect-ratio` reservado: zero CLS. Para regenerar: repetir o processo acima
(ou, quando existir a Loja-modelo em produção, capturar direto dela) e atualizar `SHOTS` se as
dimensões mudarem.

## Pendências para o Dono

1. **Foto do hero**: escolher uma foto de comida livre de direitos (Unsplash/Pexels com licença
   registrada aqui: URL, autor, data), exportar desfocada em AVIF/WebP ≤ 120 KB e trocar o
   `background-image` de `.mk-hero__bg` em `apps/web/src/app/marketing.css`.
2. **Foto do fundador**: trocar `founder-placeholder.svg` por uma foto real 240×240 (WebP) e
   atualizar `FOUNDER_PHOTO` em `apps/web/src/components/marketing/founder.tsx`.
3. **Fotos nos itens do cardápio da captura**: a captura atual mostra o estado real "sem foto"
   (ícone de talheres). Com fotos próprias de comida registradas aqui, regerar a captura.
