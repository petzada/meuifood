# 28 — Onboarding do Dono: checklist, Slug, link, QR Code e Pixel

**What to build:** Depois de aceitar o convite, o Dono vê um checklist do que falta para operar, escolhe o Slug, copia o link e baixa o QR Code da Loja, e informa os IDs de Pixel Meta e Google que o Storefront passa a disparar.

**Blocked by:** 23 — Portar Cardápio e Complementos; 29 — Área Ops.

**Status:** ready-for-agent

**Agente:** Fable (UI/UX); a rota de Slug/Pixel na API pode ser feita pelo mesmo agente ou por um Opus antes.

- [ ] Checklist no Painel: dados de contato, Slug, horários, Fulfillment, Cardápio com item disponível, Plano ativo (status vindo do servidor).
- [ ] Dono edita o Slug com validação no servidor (formato, reservados, único global); mudança de Slug avisa que links antigos param de funcionar.
- [ ] Copiar link `https://foodedelivery.com.br/loja/{slug}` e baixar QR Code (PNG e SVG) gerado no cliente.
- [ ] Dono informa IDs do Pixel Meta e do Google (validação de formato).
- [ ] Storefront carrega os pixels só da Loja visitada e dispara visualização de item, adicionar ao carrinho e compra (valor e moeda), sem nome, telefone, e-mail ou CPF.
- [ ] Operador não acessa nada disso.
- [ ] Mobile-first e visual Foode.
- [ ] Testes: Slug inválido/duplicado, Operador negado, eventos de Pixel sem dados pessoais.

## Comments

- 2026-11-04 — Cobre as histórias de Slug/link/QR da spec v1 (nunca implementadas) e o Pixel ([62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md)).

- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) ONB-01 a ONB-04, LNK-01 a LNK-03, CFG-04 e NAV-05 (`/configuracoes/loja` e `/configuracoes/divulgacao`); mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §3 e §11. Em aberto: P-ONB-1 a P-ONB-5 e P-VIS-1 a P-VIS-3 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) §6 Pixel — `view_item` ao abrir o item (I1), `add_to_cart` ao confirmar "Adicionar" (I7), `purchase` na confirmação. Pendente: P-5.4 (compartilhar Loja/item) em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-ONB-1 (tour 3 passos), P-ONB-3, P-ONB-4 (2 perguntas de perfil gravadas), P-VIS-1 (logo), P-VIS-2 (capa), P-VIS-3 (descrição), P-5.4 (compartilhar Loja), P-CFG-4, eventos do funil (P-REL-4). Vale sobre as perguntas em aberto dos comentários anteriores.
