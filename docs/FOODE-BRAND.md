# Foode — tokens de marca (extraídos do logo oficial)

**Data:** jul/2026 · **Fonte:** logotipo oficial Foode (wordmark com ovos no lugar do “oo”)  
**Decisão:** [37](decisoes/37-brand-foode-ui-outline-taste.md) · **Superfície/layout:** princípios de densidade/spacing em [DESIGN.md](DESIGN.md) (não a marca Airbnb)

## Extração do logo

| Elemento no logo | Papel | Hex (extraído) |
| --- | --- | --- |
| Fundo coral-vermelho saturado | **Primary / brand** | `#F35050` |
| Letras F / d / e e claras do ovo | **On-primary / branco** | `#FFFFFF` |
| Gemas (yolks) | **Accent** | `#FFB800` |
| Sombra 3D do logo | Só no **asset** do wordmark — **não** na UI | — |

Tipografia do wordmark: sans geométrica **pesada**, terminais arredondados, Title Case “Foode”; os “oo” são ilustração (ovos), não glyphs tipográficos.

## Tokens de produto (MVP)

### Cores

```css
:root {
  /* Brand (logo) */
  --color-primary: #F35050;
  --color-primary-active: #E04545;
  --color-primary-soft: #FFE8E8;
  --color-accent: #FFB800;          /* gema — uso escasso */
  --color-on-primary: #FFFFFF;

  /* Superfície clean (alinhado a DESIGN.md canvas/ink) */
  --color-canvas: #FFFFFF;
  --color-ink: #222222;
  --color-body: #3F3F3F;
  --color-muted: #6A6A6A;
  --color-hairline: #DDDDDD;
  --color-hairline-soft: #EBEBEB;

  /* Semântico */
  --color-error: #C13515;
}
```

- **CTA / links brand / estados ativos:** `--color-primary` (não Rausch Airbnb).  
- **Accent `#FFB800`:** só momentos pontuais (badge, destaque raro) — não competir com primary.  
- **Canvas branco + ink:** base clean; atmosfera vem de tipografia, borda e primary, não de shadow/glow.

### Tipografia

| Uso | Direção |
| --- | --- |
| Wordmark | Asset do logo (ovos); não recriar “oo” em texto |
| UI (painel + storefront) | Sans geométrica **arredondada**, pesos 400–700 — **Nunito** (ou equivalente open com terminais redondos) |
| Evitar | Inter, Roboto, Arial, system-ui como face principal; Airbnb Cereal |

Escala: manter hierarquia **modesta** no estilo DESIGN.md (display ~22–28px, body 14–16px) — peso visual no primary e no logo, não em display 64px.

### Forma / containers (regra base)

| Regra | MVP |
| --- | --- |
| Fundo de `div`/seção de conteúdo | **Sem fill** (transparente sobre canvas) |
| Borda | **Fina** (`1px` `--color-hairline`) |
| Sombra | **Não** (logo 3D ≠ elevação de UI) |
| Cantos | **Arredondados / circulares** (`border-radius` generoso; pills só onde interação pedir) |
| Conteúdo | Vive **dentro** desses containers outline |

Botões primary podem ter fill `--color-primary` (são CTAs, não “cards”). Cards de listagem/pedido/item = outline only.

### Spacing / densidade

Reutilizar tokens de spacing e a filosofia de densidade de [DESIGN.md](DESIGN.md) (base 4/8px, section 64px) — só a **marca e a elevação** mudam.
