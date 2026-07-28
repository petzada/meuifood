# 05 — Gerenciar e publicar o Cardápio da Loja

**What to build:** O Dono mantém categorias, itens, fotos e disponibilidade no Painel, e o Consumidor abre `/loja/[slug]` para navegar somente pelo Cardápio público da Loja correta.

**Blocked by:** 04 — Bloquear produção com CI e migrations validadas.

**Status:** ready-for-agent

- [ ] Dono cria, edita, ordena e remove categorias sem apagar silenciosamente itens associados.
- [ ] Dono cria e edita item com nome, descrição, preço em centavos, foto, categoria e disponibilidade.
- [ ] Imagens usam Cloudflare R2 (PUT pré-assinado; leitura pública via `R2_PUBLIC_BASE_URL`) com autorização compatível com `store_id` e papel — [57](../../../docs/decisoes/57-cloudflare-r2-imagens-cardapio.md).
- [ ] Operador não lista nem altera Cardápio; outra Loja não acessa seus dados.
- [ ] Slug válido resolve uma única Loja; Slug desconhecido responde 404 sem revelar identificadores internos.
- [ ] O Storefront mostra categorias e itens disponíveis com nome, preço, foto e descrição em UI Foode mobile-first.
- [ ] Dados privados, Modo de cobrança e configurações de gateway não aparecem na projeção pública.
- [ ] Alterações no Cardápio não corrompem snapshots de Pedidos futuros ou históricos.

