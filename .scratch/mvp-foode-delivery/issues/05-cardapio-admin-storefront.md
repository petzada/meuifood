# 05 — Gerenciar e publicar o Cardápio da Loja

**What to build:** O Dono mantém categorias, itens, fotos e disponibilidade no Painel, e o Consumidor abre `/loja/[slug]` para navegar somente pelo Cardápio público da Loja correta.

**Blocked by:** 04 — Bloquear produção com CI e migrations validadas.

**Status:** done

- [x] Dono cria, edita, ordena e remove categorias sem apagar silenciosamente itens associados.
- [x] Dono cria e edita item com nome, descrição, preço em centavos, foto, categoria e disponibilidade.
- [x] Imagens usam Cloudflare R2 (PUT pré-assinado; leitura pública via `R2_PUBLIC_BASE_URL`) com autorização compatível com `store_id` e papel — [57](../../../docs/decisoes/57-cloudflare-r2-imagens-cardapio.md).
- [x] Operador não lista nem altera Cardápio; outra Loja não acessa seus dados.
- [x] Slug válido resolve uma única Loja; Slug desconhecido responde 404 sem revelar identificadores internos.
- [x] O Storefront mostra categorias e itens disponíveis com nome, preço, foto e descrição em UI Foode mobile-first.
- [x] Dados privados, Modo de cobrança e configurações de gateway não aparecem na projeção pública.
- [x] Alterações no Cardápio não corrompem snapshots de Pedidos futuros ou históricos.

## Comments

- 2026-07-28 — Implementação na branch `cursor/cardapio-admin-storefront-391f`: migration `menu_categories`/`menu_items` + RLS; API Dono-only (`/menu/*`) e projeção pública (`/public/stores/:slug/menu`); upload R2 via `@aws-sdk/client-s3` + presigner; Painel Cardápio; Storefront `/loja/[slug]`. Nenhuma implementação de Supabase Storage. Provas locais: `pnpm lint`, `typecheck`, `test:quality`, `build` verdes; seam HTTP/RLS remota e R2 real ficam para o CI (migration aplicada no job `migrate`) / credenciais R2 ausentes localmente.
- Remoção de categoria com itens retorna HTTP 409 (`category_has_items`) + FK `ON DELETE RESTRICT`. Pedidos ainda não existem (Ticket 08); modelo do Cardápio não usa cascade que reescreveria snapshots futuros.
- Complementos/Adicionais ficam no Ticket 06 (blocked by 05); fora do checklist deste ticket.
- 2026-07-28 — CI da PR #12 (`30399795564`) verde: `quality` pass, `migrate` pass, `integration` pass (inclui `menu-routes.test.ts` + verify resíduos).
- 2026-07-28 — PR #12 mergeada em `94ec0ba9265b8b815a456458e7eb9d41ae2590cc` após validação Composer 2.5 `PASS` no HEAD `207c20c`; run final `30400238160` verde (`quality`, `migrate`, `integration`). Aceite humano registrado. Dívidas não bloqueadoras: confirmação `HEAD` pós-PUT e smoke R2 real quando houver credenciais; o teste de snapshots permanece no escopo do Ticket 08.
