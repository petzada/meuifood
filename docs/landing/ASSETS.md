# Assets da landing (Ticket 31)

| Arquivo | Uso | Estado | Licença / origem |
| --- | --- | --- | --- |
| `apps/web/public/images/hero-food-placeholder.svg` | Fundo desfocado do hero (decisão 70) | **Placeholder vetorial — trocar** | Desenhado no repositório; sem terceiros |
| `public/images/logo.png` | Wordmark | Oficial | Marca Foode |
| `public/images/hero-restaurante.png` | Não usado na landing nova | Origem/licença não registrada: **não usar** até registrar | — |
| `public/images/mobile_ui.png`, `web_ui.png` | Referência de design, não usados | — | — |

## Pendências para o Dono

1. **Foto do hero**: escolher uma foto de comida livre de direitos (Unsplash/Pexels com licença
   registrada aqui: URL, autor, data), exportar desfocada em AVIF/WebP ≤ 120 KB e trocar o
   `background-image` de `.mk-hero__bg` em `apps/web/src/app/marketing.css`.
2. **Capturas reais do produto**: os mockups do hero, do "Como funciona" e das funcionalidades
   são hoje **telas desenhadas com os componentes e tokens reais** (`apps/web/src/components/marketing/mockups.tsx`),
   com dados fictícios rotulados "exemplo". Quando houver uma Loja-modelo com dados fictícios,
   substituir por capturas reais (AVIF/WebP em 2 tamanhos, `srcset`), mantendo o `aspect-ratio`
   reservado (sem CLS).
