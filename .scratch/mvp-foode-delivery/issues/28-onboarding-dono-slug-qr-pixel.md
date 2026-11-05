# 28 — Onboarding do Dono: checklist, Slug, link, QR Code e Pixel

**What to build:** Depois de aceitar o convite, o Dono responde duas perguntas de perfil, vê um checklist do que falta para operar, completa a vitrine da Loja (logo, capa, descrição), escolhe o Slug, copia o link e baixa o QR Code, compartilha a Loja e informa os IDs de Pixel Meta e Google; o Storefront passa a disparar o Pixel e a gravar os eventos agregados do funil próprio.

**Blocked by:** 23 — Portar Cardápio e Complementos; 29 — Área Ops. Os disparos em telas do checkout e da confirmação (Pixel `purchase`, eventos `checkout` e `pedido` do funil) entram depois que a UI do [24a](24a-storefront-checkout-pedido.md) estiver integrada.

**Status:** ready-for-agent

**Agente:** Fable (UI/UX); a rota de Slug/Pixel/perfil/vitrine/eventos na API pode ser feita pelo mesmo agente ou por um Opus antes.

### Primeiro acesso e checklist

- [ ] **Duas perguntas de perfil** no primeiro acesso do Dono — culinária e objetivo — com opções fechadas e "Outro"; a tela informa que as respostas são para uso interno da Foode; gravadas por Loja e lidas pelo Ops no detalhe da Loja em `/ops` (P-ONB-4; prevalece sobre ONB-03). Perguntas respondidas não reaparecem.
- [ ] Checklist no Painel: dados de contato, Slug, horários, Fulfillment, Cardápio com item disponível, Plano ativo (status vindo do servidor), sem ordem forçada; "Plano ativo" não acionável; ao concluir, some e aparece uma vez "Sua Loja está pronta para receber Pedidos" (ONB-01, ONB-02, ONB-04).
- [ ] Cardápio vazio leva ao cadastro pelo próprio Dono; nenhum item fictício ou Cardápio-semente (P-ONB-3).

### Dados e vitrine da Loja (Dono)

- [ ] Dados de contato editáveis (WhatsApp com máscara); dados cadastrados pelo Ops (CNPJ, chave Pix, titular) só leitura com "Para alterar, fale com a equipe Foode" (CFG-04).
- [ ] Endereço da Loja com **CEP opcional** que preenche o endereço (ViaCEP/BrasilAPI, falha silenciosa), igual ao cadastro do Ops (P-CFG-4).
- [ ] **Logo quadrado** da Loja (JPEG/PNG/WebP ≤ 5 MiB, R2 pelo binding `MEDIA` como no Cardápio) exibido no cabeçalho do Storefront (P-VIS-1).
- [ ] **Imagem de capa** da Loja no topo do Storefront, sem cor personalizada (a identidade segue Foode) (P-VIS-2).
- [ ] **Descrição curta** até 160 caracteres com contador, mostrada no Storefront (cabeçalho e sheet "Sobre a Loja") e usada como meta description da página da Loja (P-VIS-3).

### Slug, link, QR e compartilhar

- [ ] Dono edita o Slug com validação no servidor (formato, reservados, único global); aviso **antes** de salvar que links e QR Codes já divulgados param de funcionar; link resultante visível enquanto digita (LNK-02).
- [ ] Copiar link `https://foodedelivery.com.br/loja/{slug}` e baixar QR Code (PNG e SVG) gerado no cliente (LNK-01).
- [ ] **Compartilhar a Loja** no cabeçalho do Storefront: Web Share API quando existir, senão "Copiar link" com feedback em `aria-live` (P-5.4).

### Pixel e funil próprio

- [ ] Dono informa IDs do Pixel Meta e do Google (opcionais, validação de formato inline) (LNK-03).
- [ ] Storefront carrega os pixels só da Loja visitada e dispara `view_item` ao abrir o item, `add_to_cart` ao confirmar "Adicionar" e `purchase` na confirmação (valor e moeda), sem nome, telefone, e-mail ou CPF.
- [ ] **Eventos do funil próprio** (visita → item → carrinho → checkout → Pedido) gravados na `api` como contadores agregados por Loja e dia, sem dado pessoal (sem IP, telefone, cookie de identificação ou id de Consumidor), com rate limit; fonte do relatório do Ticket 14 (P-REL-4). O Pixel não é fonte do funil.

### Permissões, testes e revisão

- [ ] Operador não acessa nada disso.
- [ ] Mobile-first e visual Foode.
- [ ] Testes: Slug inválido/duplicado, Operador negado, eventos de Pixel e do funil sem dados pessoais, descrição > 160 rejeitada, imagem inválida rejeitada, respostas de perfil visíveis só ao Ops e ao Dono da Loja, vazamento entre Lojas. Rotas com D1 via `@cloudflare/vitest-plugin` só no CI.
- [ ] UI segue as [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) (ONB-01, ONB-02, ONB-04, LNK-01 a LNK-03, CFG-04, NAV-05) e [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) (C1, §6 Pixel) aplicáveis e passa no `/code-review` incluindo os critérios do antigo [Ticket 20](20-aprofundar-contratos-e-modules-do-front.md) (contrato único em `@foode/shared`, matriz de papéis em module, testes que afirmam comportamento).
- [ ] "Link personalizado" no lugar de "Slug" em toda a UI e copy ([69](../../../docs/decisoes/69-link-personalizado-redirecionamento.md)).
- [ ] Histórico de links por Loja: link antigo responde 308 para o atual (mesmo subcaminho e query, um salto só), fica reservado à Loja e a Loja pode voltar a ele; testes D1 de redirecionamento, reserva e isolamento ([69](../../../docs/decisoes/69-link-personalizado-redirecionamento.md)).

## Comments

- 2026-11-04 — Cobre as histórias de Slug/link/QR da spec v1 (nunca implementadas) e o Pixel ([62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md)).

- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) ONB-01 a ONB-04, LNK-01 a LNK-03, CFG-04 e NAV-05 (`/configuracoes/loja` e `/configuracoes/divulgacao`); mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §3 e §11. Em aberto: P-ONB-1 a P-ONB-5 e P-VIS-1 a P-VIS-3 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).

- 2026-11-05 — Referência UX do concorrente (sem mudar critérios): [DIRETRIZES-UX-CLIENTE](../../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) §6 Pixel — `view_item` ao abrir o item (I1), `add_to_cart` ao confirmar "Adicionar" (I7), `purchase` na confirmação. Pendente: P-5.4 (compartilhar Loja/item) em [PERGUNTAS-CLIENTE](../../../docs/referencias/anota-ai/PERGUNTAS-CLIENTE.md).

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-ONB-1 (tour 3 passos), P-ONB-3, P-ONB-4 (2 perguntas de perfil gravadas), P-VIS-1 (logo), P-VIS-2 (capa), P-VIS-3 (descrição), P-5.4 (compartilhar Loja), P-CFG-4, eventos do funil (P-REL-4). Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): tour de 3 passos, capa, perfil no 1º acesso e eventos do funil próprio mantidos.

- 2026-11-05 — Critérios consolidados com 63–65: P-ONB-3, P-ONB-4 (com leitura no `/ops`, pendente do Ticket 29), P-VIS-1, P-VIS-2, P-VIS-3, P-5.4 (Loja), P-CFG-4 (lado do Dono) e eventos do funil (P-REL-4) entraram no checklist. O tour de 3 passos (P-ONB-1) foi para o [24b](24b-painel-operacao-pedido.md), porque a fila nasce lá e o 28 roda antes dele.

- 2026-11-05 — Decisão [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md) confirma a ida do tour de 3 passos (P-ONB-1) para o 24b.

- 2026-11-05 — Fatia contrato + API (branch `feat/28-onboarding-391f`): migration 0005 (`store_showcases`, `store_onboarding`, `store_funnel_daily`), `@foode/shared/onboarding`, RPCs do Dono no `PainelRpc` (`onboardingGet`, `onboardingAnswerProfile`, `onboardingAcknowledgeReady`, `storeSettingsGet`, `storeCheckSlug`, `storeSetSlug`, `storeSetContact`, `storeSetPixels`, `storeSetShowcase`, `storeUploadBrandImage`, `funnelReport`), `ownerProfile` no `opsGetStore`, `showcase` no `GET /storefront/lojas/:slug/estado`, `POST /storefront/lojas/:slug/eventos` (funil; `order` contado pela api na criação do Pedido) e `GET /media/stores/:id/brand/:file`. QR Code gerado no cliente a partir de `storeUrl` (LNK-01), sem lib na api. Pendente: UI (admin `/configuracoes/loja` e `/configuracoes/divulgacao`, perguntas de perfil, checklist; web: logo/capa/descrição/meta description, Pixel, compartilhar, envio dos eventos). CEP do endereço do Dono segue obrigatório (`store_profiles.address_postal_code NOT NULL`): P-CFG-4 "CEP opcional" exige contract.

- 2026-11-05 — Decisão [69](../../../docs/decisoes/69-link-personalizado-redirecionamento.md): links antigos funcionam sempre (308 + reserva); "Link personalizado" na UI. Substitui "Slug sem histórico".

- 2026-11-05 — Decisão [69](../../../docs/decisoes/69-link-personalizado-redirecionamento.md) na API/DB (branch `feat/28-onboarding-391f`): tabela `store_slug_history` na migration 0005 (link antigo único globalmente, FK para `stores`, `utcCheck`). `storeSetSlug` (e a troca pelo Ops) grava o anterior no histórico na mesma escrita; voltar a um link antigo da própria Loja o tira do histórico; link antigo de OUTRA Loja = `conflict` (Dono, `opsCreateStore` e `opsUpdateStore`); `storeCheckSlug` devolve `taken` para link antigo de outra Loja. **Contrato de redirecionamento:** toda rota `/storefront/lojas/{antigo}/...` da api que daria 404 responde **308** com `Location: /storefront/lojas/{atual}/...` (mesmo subcaminho e query, um salto, inclusive Loja suspensa), header `x-foode-current-slug` e corpo `{ error: "slug_moved", currentSlug }` (`storefrontSlugMovedSchema`, `STOREFRONT_CURRENT_SLUG_HEADER` e `movedStorePath` em `@foode/shared/onboarding`). O web chama a api com `redirect: "manual"` e, ao receber 308, responde 308 para `/loja/{atual}{subcaminho}?{query}` (`movedStorePath(pathname + search, currentSlug)`). Pendente no admin: o `checkSlug` do Ops (lado cliente) só conhece os slugs atuais; o servidor já recusa link reservado com `conflict`. Copy: "Seus links e QR antigos continuam funcionando."
