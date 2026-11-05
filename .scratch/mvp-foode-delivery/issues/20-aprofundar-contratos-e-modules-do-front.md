# 20 — Aprofundar contratos e modules do Storefront e do Painel

**What to build:** O contrato entre API e apps deixa de ser redigitado em cada lado, o carrinho do Storefront separa regra de apresentação, a matriz RBAC do Painel ganha um module, e o legado das duplicações do Ticket 18 é migrado por completo.

**Blocked by:** 14 — Expor Plano, relatórios e Repasses ao Dono; 15 — Reconciliar pagamentos e repasses por Cron Triggers.

**Status:** ready-for-agent

**Agente:** Fable (front), com revisão de contrato por Opus se tocar `@foode/shared`.

> **Fase B do Ticket 18.** Este ticket assume que os modules compartilhados já existem e que a fila de produto (Tickets 09–16) terminou — é onde a migração dos call sites legados acontece sem disputar arquivo com ninguém.

- [ ] O contrato do Storefront e da operação da Loja vive como schema único em `@foode/shared`; os apps parseiam em vez de redeclarar.
- [ ] O module de estado do carrinho está separado da apresentação e é exercitável sem DOM.
- [ ] A matriz "papel → áreas visíveis" tem um module, consumido pela navegação e pelo carregamento de dados.
- [ ] O feedback por querystring do Painel tem um module; `team` deixa de repetir `redirect` inline.
- [ ] Os call sites legados de dinheiro, transporte e controles (Ticket 18) estão migrados por completo.
- [ ] Os testes do Painel afirmam a matriz de papéis em vez de procurar substrings em HTML.

## Achados — Storefront, Painel e contratos

### 20.1 Contrato do Storefront redigitado em quatro lugares

`apps/web/src/app/loja/[slug]/store-operation-status.tsx:3-11` · `apps/admin/src/app/operation/operation-panel.tsx:9-18` · `apps/api/src/store-operation.ts:5-19` · `packages/db/src/index.ts:79-107` · validação ad hoc em `apps/web/src/app/loja/[slug]/page.tsx:34-40` e `apps/admin/src/app/page.tsx:256-263, 286-292, 313-316`

`StoreOperation`, `OperatingPeriod` e o payload público do Cardápio são declarados à mão em cada app; o `web` valida a resposta com quatro `if` encadeados. Se a API mudar `state` ou `nextOpeningAt`, nenhum type check quebra — o front falha em runtime ou renderiza silenciosamente errado.

O padrão oposto já existe no mesmo repo: `packages/shared/src/cart-preview.ts` estabelece schema Zod compartilhado, usado inclusive para reidratar o `localStorage`.

**Solução.** Promover esses shapes a um module de contrato em `@foode/shared`, com o schema como interface única.

**Ganhos.** *Leverage* direto (um schema serve `web`, `admin` e `api`) e mais *depth* no shared: a validação de resposta some dos page components. Hoje `apps/web/src/app/loja/[slug]/page.test.tsx:12-65` fabrica o payload à mão e nada garante que ele corresponde ao que a API emite.

**Força:** Strong.

### 20.2 `storefront-cart.tsx`: três modules num arquivo, nenhum deles testável

`apps/web/src/app/loja/[slug]/storefront-cart.tsx` — `ItemCustomizer`, `CartPreview`, `StorefrontCatalog` (o arquivo cresceu para além de 524 linhas com o Ticket 08)

Não é um module deep — é um arquivo largo com três responsabilidades e uma interface interna acidental: `onAdd` devolve `boolean` só para o filho saber se pode limpar o próprio estado.

Não há nenhum teste de `storefront-cart.tsx`: hidratação do `localStorage`, `assertSingleStoreCart` e a mensagem de Complemento obrigatório só existem no papel. O único teste do diretório é server-render de `page.test.tsx`, no formato `expect(html).toContain(...)`.

**Solução.** Separar o module de estado do carrinho (hidratação, single-store, mutações de linha) da apresentação.

**Ganhos.** *Locality* — a regra de carrinho fica num lugar exercitável sem DOM; a apresentação vira renderização pura. Os testes passam a cobrir "carrinho de outra Loja é rejeitado" e "Complemento obrigatório bloqueia o Adicionar".

**Força:** Strong.

### 20.3 O `available` do Adicional é apagado no seam público e reinjetado como constante

`packages/db/src/menu-customization.ts:39-43` (`PublicAdditionalView`, sem `available`) · `packages/db/src/index.ts:491-497` (filtro server-side) · `apps/web/src/app/loja/[slug]/storefront-cart.tsx:55-70` · `packages/shared/src/cart-preview.ts:97-105`

O seam público remove o campo `available`; `itemForCalculation` então escreve `available: true` fixo para satisfazer `CatalogItemForCart`. O resultado é que o ramo `additional_unavailable` de `validateCartLineChoices` é estruturalmente inalcançável no `web` — a regra compartilhada recebe uma constante.

A recalculação do Ticket 08 aplica a regra de verdade, então um Adicional que fica indisponível enquanto o carrinho dorme no `localStorage` passa na validação do front e só é rejeitado no envio do Pedido.

**Solução.** Manter `available` na view pública (o filtro server-side vira otimização, não fonte de verdade) para que o mesmo dado alimente a mesma função nos dois lados.

**Ganhos.** *Locality* — o campo que a regra lê acompanha o item até o call site. *Leverage* — uma única validação passa a valer de fato no Storefront e no servidor. Os casos de indisponibilidade em `cart-preview.test.ts` deixam de ser hipotéticos para o `web`.

**Força:** Worth exploring.

### 20.4 RBAC do Painel expresso duas vezes, testado por substring

`apps/admin/src/app/page.tsx:77-84` (nav) e `:243-321` (fetch condicional) · `apps/admin/src/app/page.test.tsx:15-23`

A matriz da Decisão 38 aparece como `role === "owner"` na navegação e, separadamente, como um bloco `if (role.data === "owner")` de 79 linhas que decide, busca, valida e monta três painéis. Nada nomeia a capability; adicionar uma área exige lembrar dos dois pontos.

O teste que protege isso é `expect(html).not.toContain("Cardápio")` — frágil por construção: a copy do `TeamPanel` já menciona "Dono" e "Configurações", e qualquer texto visível ao Operador contendo a palavra "Cardápio" quebra o teste sem que a regra tenha mudado.

**Solução.** Um module que responda quais áreas o papel enxerga, consumido tanto pela nav quanto pelo carregamento de dados, com o page component apenas orquestrando.

**Ganhos.** *Locality* da matriz RBAC num lugar só, e o page component encolhe. O teste passa a afirmar a matriz (papel → áreas) em vez de procurar substrings em HTML.

**Força:** Worth exploring · **Nota:** pareia com 19.5 (RBAC da API) — a mesma matriz expressa nos dois lados do seam.

### 20.5 Feedback por querystring: união de códigos + mapa + parser, três vezes

`apps/admin/src/app/page.tsx:36-47, 264-266, 293-298, 317-319` · `menu/menu-panel.tsx:36-81` · `operation/operation-panel.tsx:20-34` · `menu/actions.ts:23-25` · `menu/customization-actions.ts:23-25` · `operation/actions.ts:23-25` · `team/actions.ts:33, 35, 40, 48, 50`

Cada área do Painel reinventa o mesmo mecanismo: união de literais, `Record<Feedback, string>`, `feedbackRedirect` com query e âncora hardcoded, e `Object.hasOwn(map, param)` no page component. `team` nem chegou a extrair o helper — repete `redirect("/?equipe=...#equipe")` cinco vezes inline.

A convenção "código terminado em `erro` vira `role="alert"`" está reimplementada em três lugares, com uma exceção manual (`categoria-com-itens`) que só existe numa delas.

**Solução.** Um module de feedback do Painel em que a seção declara seus códigos e recebe parser, redirect e semântica de alerta prontos.

**Ganhos.** *Depth* — o page component para de conhecer o formato da querystring de cada seção. A regra "erro é `alert`, sucesso é `status`" ganha um único ponto de teste.

**Força:** Worth exploring.

### 20.6 Fase B do Ticket 18 — migrar o legado

Concluir o que o Ticket 18 deixou pela metade por decisão deliberada:

- Migrar os call sites restantes de reais↔centavos para o module de `@foode/shared`.
- Migrar os `fetch` restantes para os adapters de transporte de `admin` e `web`.
- Migrar as 33 ocorrências da string de input e os CTAs hand-rolled para `@foode/ui`; mover `SubmitButton` de `app/team/` para o module compartilhado.
- Migrar os arquivos de teste restantes para o module de fixture.

## Achado descartado

**Bloqueio de checkout no Storefront** — a exploração inicial (sobre `f64ea28`) apontou que `checkout.allowed` e `blockReason` chegavam ao `web` e nunca eram lidos, deixando "Adicionar ao carrinho" ativo com a Loja em Pausa. **Verificado como já resolvido pelo Ticket 08**: `checkoutAllowed` atravessa de `page.tsx:58` até `storefront-cart.tsx:338`, onde de fato bloqueia. Registrado aqui para que a próxima passada de `/improve-codebase-architecture` não o ressuscite.

## Comments

- 2026-07-29 — Ticket derivado de `/improve-codebase-architecture` rodado sobre `f64ea28`. O ADR 0005 (brand outline) não é contrariado por nenhum achado — 18.3 é aplicação incompleta dele, não conflito.

- 2026-11-04 — Revisado no pivô: 20.1 e 20.3 entram no Ticket 23; a Fase B do 18 deixa de existir (os seams nascem no port). Restam 20.2 (carrinho), 20.4 (matriz RBAC do Painel) e 20.5 (feedback por querystring), a reavaliar contra o código novo no fim da fila de produto.

- 2026-11-05 — Referência Anota (lojista): os achados 20.4 e 20.5 encontram as diretrizes NAV-01/NAV-02 (campo `group` opcional em `RouteRule`) e T-04/T-05 (estados e feedback) de [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md). Achado de contraste T-02 (branco sobre `#F35050` = 3,5:1, abaixo do AA) aguarda P-DS-1 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md).
