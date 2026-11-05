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
