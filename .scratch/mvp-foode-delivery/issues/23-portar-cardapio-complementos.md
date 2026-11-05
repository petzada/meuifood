# 23 — Portar Cardápio, Complementos e imagens para a stack nova

**What to build:** O Dono gerencia Cardápio, Complementos e Adicionais no Painel e o Storefront publica o Cardápio, com o mesmo comportamento dos Tickets 05 e 06, agora sobre D1, Hono e R2 por binding — nascendo sobre os seams compartilhados em vez de copiar código.

**Blocked by:** 22 — Portar Auth e RBAC para Better Auth.

**Status:** ready-for-agent

**Agente:** Opus para API/dados; Fable para as telas do Painel e do Storefront, após o commit de contrato (schemas em `@foode/shared`).

- [ ] Categorias, itens, disponibilidade, Complementos e Adicionais portados para D1 com o comportamento e os testes HTTP dos Tickets 05/06.
- [ ] Upload de imagem **sem URL pré-assinada e sem credenciais S3**: o `admin` envia os bytes pela RPC do service binding (só Dono), a `api` confere JPEG/PNG/WebP ≤ 5 MiB pela assinatura dos bytes e grava no R2 pelo binding `MEDIA` com chave `stores/{store_id}/menu/{uuid}.{ext}`; leitura pública por rota da `api` (ou domínio público do bucket) ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md), [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- [ ] Storefront resolve a Loja pelo Slug e nunca aceita `store_id` do navegador.
- [ ] Carrinho por Loja com recálculo no servidor.
- [ ] Opção de Complemento com preço opcional (`priceCents`, padrão 0) somado no item, no carrinho e no recálculo do servidor (P-1.1).
- [ ] O máximo (`max_select`) do grupo de Complemento vale também para opções pagas; extra pago sem limite é Adicional (ex.: "Molho extra"), não opção de Complemento.
- [ ] Sem meio a meio e sem categoria "Pizza": pizzaria usa um grupo de Complemento "Sabores" com até 2 opções (P-1.2, P-CAR-2); sem classificações (vegano etc.) (P-CAR-3); sem preço "de/por" (P-1.3).
- [ ] **Sem observação por item** no Storefront nem no carrinho (P-1.5); a observação geral do Pedido é do checkout (24a).
- [ ] **Busca de itens** no Storefront, com rótulo visível e filtro no navegador sobre o Cardápio já carregado (sem chamada à `api`), normalizando acentos e caixa, com contagem anunciada e estado "Nenhum item encontrado" (P-1.4, C4).
- [ ] **Destaques:** o Dono marca até **4 itens**; o limite é conferido no servidor (5º rejeitado com mensagem clara); o Storefront mostra os Destaques disponíveis em carrossel no topo do Cardápio, que some quando não há nenhum (P-5.5).
- [ ] **Compartilhar item** com URL própria (`?item=<id>`): Web Share API quando existir, senão "Copiar link" com feedback "Link copiado" em `aria-live` (P-5.4, I1).
- [ ] "**Copiar grupos de outro item**" no item: copia Complementos (grupos e opções) de um item da mesma Loja como cópia independente; sem grupos compartilhados entre itens (P-CAR-1).
- [ ] **Preço inline** na lista de itens, salvo só com confirmação explícita (Enter ou ✓; Esc desfaz); sem edição em massa (P-CAR-5, CAR-03).
- [ ] Cardápio vazio no Painel mostra como começar ("Crie sua primeira categoria") e nenhum item fictício é criado (P-ONB-3, P-CAR-4).
- [ ] Token `--color-primary-strong` (≈ `#D63A3A`, ≥ 4,5:1 sobre branco) em `@foode/ui` para fundos com texto (botão primário, badge) e links; `#F35050` segue em bordas, ícones, foco e marca (P-DS-1).
- [ ] `@foode/shared` expõe dinheiro reais↔centavos em um só lugar (18.1); `admin` e `web` têm um adapter de transporte cada (18.2); controles de formulário e `Button` vêm de `@foode/ui` (18.3).
- [ ] Contrato público do Cardápio é um schema único em `@foode/shared`, parseado pelos apps (20.1, 20.3).
- [ ] Testes de vazamento cobrem Cardápio e imagens com duas Lojas; testes do teto de Destaques, preço de opção e "copiar grupos" sem atravessar Lojas. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI.
- [ ] UI segue as [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) (G1–G10, C1–C5, I1–I8, K1–K6) e [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) (CAR-01 a CAR-07, T-04, T-06, T-07) aplicáveis e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, estado do carrinho separado da apresentação e testável sem DOM, `available` preservado na view pública, matriz de papéis em module, testes que afirmam comportamento).

## Comments

- 2026-11-04 — Aberto no pivô. Porta 05 e 06 e aplica a Fase A do Ticket 18 nos arquivos reescritos.

- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) CAR-01 a CAR-07 e T-04/T-06/T-07; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §12. Em aberto: P-CAR-1 a P-CAR-5 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md) (reuso de grupos, pizza, classificações, cadastro assistido, edição em massa).

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) G1–G10, C1–C5, I1–I8, K1–K6; mapa em [MAPA-UX-CLIENTE](../../../docs/referencias/anota-ai/MAPA-UX-CLIENTE.md). Decidir antes do commit de contrato: P-1.1 (preço na opção de Complemento) e P-1.5 (observação por item); também P-1.4 e P-5.4 em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-1.1 (preço na opção de Complemento), P-1.4 (busca), P-5.4 (compartilhar item), P-5.5 (Destaques até 4), P-CAR-1 (copiar grupos), P-CAR-5 (preço inline), P-DS-1 (primary-strong em @foode/ui); sem obs. por item (P-1.5). Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Commit de contrato (`feat/23-contrato-391f`). Destrava a fatia API e a UI:
  - **D1:** `packages/db/src/schema/menu.ts` + migration `0003_cardapio.sql` (expand): `menu_categories` (com `available`, CAR-02), `menu_items` (`featured`, `image_object_key` com CHECK do prefixo da Loja), `menu_complement_groups` (`min_select`/`max_select`), `menu_complement_options` (`price_cents` padrão 0, P-1.1), `menu_additionals`. Filhos ligados ao pai por FK composta `(store_id, id)` (sem vínculo entre Lojas); grupos/opções/Adicionais em cascade com o item; categoria com itens não apaga. Teto de 4 destaques (P-5.5) e `min_select` ≤ opções ficam no servidor.
  - **Número 0003 com lacuna:** a 0002 é do Ticket 29. O wrangler aplica por nome e o drizzle-kit aceita a lacuna (journal `idx` 3; drift-check sem mudanças). **Integração:** o 29 entra antes; depois do merge dele, apague `0003_cardapio.sql`, `meta/0003_snapshot.json` e a entrada do journal e rode `pnpm db:generate -- --name cardapio` — sai de novo `0003_cardapio.sql` (SQL idêntico, snapshot encadeado na 0002; sem isso o drizzle-kit acusa colisão de snapshots com o mesmo pai).
  - **Shared:** `@foode/shared/menu` — opção com `priceCents` (padrão 0) somada em `lineUnitCents`/`cartSubtotalCents`; `featured` no item e teto `MAX_FEATURED_ITEMS` no `publicMenuSchema`; `cartQuoteRequestSchema`/`cartQuoteResponseSchema` (recálculo no servidor); `featuredItems`, `searchMenu`/`normalizeSearchText` (P-1.4), `menuItemSharePath` (P-5.4); `admin.ts` com os Zod de todas as RPCs `menu*`, chave/URL de imagem R2 e os tipos `AdminMenu*`.
  - **API:** 19 RPCs `menu*` no `PainelRpc`/`PainelApi` (guard `store.menu` = só Dono; corpo `not_implemented`, em `apps/api/src/menu-service.ts`); rotas públicas `GET /storefront/lojas/:slug/cardapio` (= `publicMenuSchema`) e `POST /storefront/lojas/:slug/carrinho` (501 até a fatia API). `aws4fetch` adicionado para assinar o PUT do R2; secrets `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` e vars `R2_ACCOUNT_ID`/`R2_PUBLIC_BASE_URL` ainda não existem.
  - **UI:** token `--color-primary-strong` (#d63a3a, 4,64:1) no `brand.css`; Button primário e badge primário usam o token (P-DS-1).

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): upload de imagem pelos bytes via RPC + binding MEDIA (sem URL pré-assinada S3, decisão 59); Destaques (carrossel 4) mantidos.

- 2026-11-05 — Fatia API (`feat/23-api-391f`). Operações em `db.store(ctx).menu()` (auditoria no mesmo `batch`; 4 Destaques e Adicionais por item conferidos no INSERT/UPDATE; `min_select` ≤ opções por UPDATE de guarda que quebra o CHECK e desfaz o batch) e `db.storefront.publicMenuBySlug`. **Mudança no contrato da imagem (decisão 64):** `menuRequestImageUpload`/`MenuImageUploadTicket` saem; entra `menuUploadImage(caller, { contentType, bytes })` → `{ objectKey, imageUrl }`. A api confere JPEG/PNG/WebP ≤ 5 MiB pela assinatura dos bytes (`detectMenuImageContentType` em `@foode/shared/menu`), grava pelo binding `MEDIA` e serve em `GET /media/stores/{store_id}/menu/{uuid}.{ext}` (cache imutável, `nosniff`); a base pública é a var `MEDIA_PUBLIC_BASE_URL` (workers.dev até o Ticket 25). `aws4fetch` e as vars/secrets `R2_*` saíram. Storefront: `GET …/cardapio` (só Loja `active`; categorias disponíveis com itens; itens indisponíveis com `available: false`) e `POST …/carrinho` (recálculo com preço de opção; 404 em Loja não ativa).

- 2026-11-05 — Integração com a `master` (Ticket 29, branch `feat/23-integra-master-391f`): `0003_cardapio` regenerada encadeada na `0002_ops_lojas_planos_taxas` (SQL idêntico; só snapshot/journal mudaram). Testes D1 do Cardápio passam a suspender a Loja por `ops.changeStoreStatus` (o `setStoreStatus` saiu no 29).

- 2026-11-05 — Critérios consolidados com 63–65: P-1.1, P-1.2, P-1.3, P-1.4, P-1.5, P-5.4 (item), P-5.5, P-CAR-1, P-CAR-2, P-CAR-3, P-CAR-5, P-ONB-3/P-CAR-4 e P-DS-1 entraram no checklist; o critério de URL pré-assinada saiu (upload pelos bytes via binding `MEDIA`, decisão 64); critério de UI/`/code-review` com os achados do antigo Ticket 20.

- 2026-11-05 — Esclarecimento confirmado pelo Dono no teste visual: o máximo do grupo de Complemento vale também para opções pagas (P-1.1 não cria exceção); extra pago sem limite é Adicional (ex.: "Molho extra"). Critério acrescentado ao checklist.
