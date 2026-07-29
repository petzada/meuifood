# 18 — Instalar os seams compartilhados antes que as cópias se multipliquem

**What to build:** Os quatro pontos onde cada ticket novo paga pedágio copiando código — conversão reais↔centavos, chamada à API, controles de formulário e fixture de teste de rota — ganham um module com dono, para que os Tickets 09 a 16 nasçam consumindo em vez de copiando.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada (merge do PR #17).

**Status:** todo

> **Ticket de custo crescente.** Estes achados são os únicos do lote que **pioram sozinhos**: cada ticket implementado adiciona uma cópia nova. O Ticket 08 já pagou os quatro pedágios. Adiar até o fim do MVP não mantém o custo — multiplica-o por oito.
>
> **Estratégia de duas fases, para não travar os tickets em voo:**
> **Fase A (agora, aditiva, conflito baixo)** — criar os modules e migrar apenas os call sites que os tickets seguintes não tocam.
> **Fase B (no Ticket 20)** — migrar o legado restante, quando não houver mais ticket de produto disputando os arquivos.

- [ ] `@foode/shared` expõe as duas direções de dinheiro (reais→centavos, centavos→R$), ao lado de `previewLineTotalCents`.
- [ ] `admin` e `web` têm cada um seu adapter de transporte, com URL, auth e decodificação de erro resolvidos dentro.
- [ ] `@foode/ui` expõe controles de formulário; os CTAs hand-rolled do Storefront e do Painel passam a usar `Button`.
- [ ] Existe um module de fixture de teste de rota — interface "me dê um app com duas Lojas".
- [ ] A divergência de `store-routes.test.ts` (roda com credencial administrativa) deixa de existir por construção.
- [ ] Os Tickets 09+ consomem os modules novos em vez de copiar.

## Achados — duplicação que cresce a cada ticket

### 18.1 Reais ↔ centavos: sete implementações da mesma conversão

`apps/admin/src/app/menu/actions.ts:27-34` e `customization-actions.ts:27-34` (`reaisToCents` byte a byte idêntico, regex incluída) · `menu-panel.tsx:83-92` e `item-customization-panel.tsx:39-48` (`formatPrice` + `priceInputValue` idênticos) · `apps/admin/src/app/orders/orders-queue.tsx` · `apps/web/src/app/loja/[slug]/storefront-cart.tsx:48-53` · `apps/web/src/app/loja/[slug]/pedido/[accessToken]/page.tsx`

`priceCents` é a unidade canônica em todo o domínio (`packages/db`, `@foode/shared`, `api`), mas a fronteira "o Dono digita reais / o Consumidor lê R$" está reimplementada sete vezes. Uma correção de arredondamento, ou aceitar `1.5` como R$ 1,50, precisa acertar sete cópias — e nenhuma tem teste.

**Solução.** Mover as duas direções para o module de dinheiro em `@foode/shared`, junto de `previewLineTotalCents`, que já é a autoridade de aritmética em centavos.

**Ganhos.** *Leverage* puro, e o deletion test é limpo: apagar as cópias concentra num module que já tem teste unitário e razão para existir.

**Força:** Strong · **Conflito:** baixo (duas das sete cópias nasceram no Ticket 08).

### 18.2 O seam entre UI e transporte está copiado em sete arquivos

`apps/admin/src/app/page.tsx:206` · `menu/actions.ts:8` · `menu/customization-actions.ts:8` · `operation/actions.ts:8` · `team/actions.ts:8` · `apps/web/src/app/loja/[slug]/page.tsx:21` · `apps/web/src/app/loja/[slug]/pedido/[accessToken]/page.tsx:31`

`apiUrl()` aparece sete vezes idêntico e `accessToken()` quatro; os 27 `await fetch(` das duas apps repetem `new URL(path, apiUrl())`, `authorization: Bearer`, `content-type` e um `if (!response.ok)` que descarta o corpo do erro. O único lugar onde o status importa (`response.status === 409` em `menu/actions.ts:81`) é exceção manual — a forma do erro da API não tem representação nenhuma no front.

**Solução.** Um module adapter de transporte por app (`admin` autenticado, `web` público) expondo a chamada já com URL, auth e decodificação de erro resolvidas.

**Ganhos.** *Depth* — interface pequena, muita implementation escondida (env, token, redirect de sessão, mapeamento de status). Hoje trocar `API_URL` ou tratar 409 genericamente exige editar sete arquivos. Fica testável sem Supabase nem runtime do Next; é justamente por isso que nenhuma Server Action tem teste hoje.

**Força:** Strong · **Conflito:** médio — o Ticket 08 escreveu a sexta e a sétima cópia, e o polling de 10s da fila é exatamente o caso em que o `if (!response.ok)` mudo dói.

### 18.3 O sistema visual existe em `@foode/ui` e os CTAs mais quentes o contornam

`packages/ui/src/index.tsx:11-56` e `styles.css:1-51` (`Button`, com `:focus-visible` e variantes) · desvios em `apps/web/src/app/loja/[slug]/storefront-cart.tsx:264-271, 373-379, 501-509` · `apps/admin/src/app/page.tsx:70-83` · `operation-panel.tsx:153-185` · 33 ocorrências da mesma string de input (`rounded-xl border border-[var(--color-hairline)]`) em 7 arquivos

`OutlineContainer` é usado com disciplina, `Button` não. "Adicionar ao carrinho" (o CTA principal do Consumidor), "Remover" do carrinho, "Esvaziar carrinho anterior", a pill de navegação do Painel e os botões de período do Funcionamento são todos `<button className="...">` à mão.

**A consequência é concreta, não estética:** `.foode-button:focus-visible { outline: 3px solid var(--color-primary-soft) }` não se aplica a nenhum deles. O caminho de compra do Consumidor não tem foco de teclado visível.

O input de formulário não tem module nenhum — a mesma string está copiada 33 vezes e três variantes já divergiram (`min-h-11` vs `min-h-12`, com e sem `focus:ring`).

Nota lateral de *locality*: `SubmitButton` (`apps/admin/src/app/team/submit-button.tsx`) é importado por `menu-panel`, `item-customization-panel` e `operation-panel` via `../team/` — um controle compartilhado morando dentro de uma feature.

**Solução.** Um module de controles de formulário em `@foode/ui` ao lado de `Button`/`OutlineContainer`, e migrar os CTAs hand-rolled (inclusive o do Storefront, que precisa de `disabled` — já suportado via props de `<button>`).

**Ganhos.** *Leverage* sobre Primary Foode e Container outline num só lugar; o deletion test passa. `packages/ui/src/index.test.tsx` vira o ponto onde foco e acessibilidade são garantidos uma vez para as duas apps.

**Força:** Strong · **Conflito:** baixo (conflito de arquivo), mas o custo de adiar é retrabalho: as telas de Delivery, PIX e Crédito nascem com a 34ª cópia do input.

**ADR:** `docs/adr/0005-brand-foode-outline-taste-skill.md` — os containers seguem a decisão, os controles não. Não é conflito com o ADR; é aplicação incompleta dele.

### 18.4 Cinco cópias do preâmbulo de teste, com uma divergência já instalada

`apps/api/src/{store-routes,menu-routes,auth-rbac,menu-customization-routes,order-routes}.test.ts` · `packages/db/scripts/production-database-url.mjs:9`

O bloco `requiredSecret` + `productionDatabaseUrls` + `syntheticTaxId`, ~70 linhas, está copiado literalmente em cinco arquivos de teste. Cada ticket novo paga esse pedágio antes da primeira asserção — o Ticket 08 pagou.

**A divergência já existe.** `store-routes.test.ts:31` chama-se `productionDatabaseUrl` (singular) e **não valida `BUSINESS_DATABASE_URL`**, então roda com credencial administrativa — justamente o que `auth-rbac.test.ts:278-282` prova que deve ser rejeitado.

Consequência visível: as rotas `/operation` (`store-operation-routes.ts:42-83`) não têm nenhum `.test.ts`; o comportamento delas é provado por um **script** de preflight (`scripts/store-operation-preflight.ts`).

**Solução.** Um module de fixture único que resolva credenciais, crie Loja/membros e devolva o `app`; mover as asserções do preflight de `/operation` para um `store-operation-routes.test.ts` que o use.

**Ganhos.** *Leverage* — o próximo ticket começa na asserção. *Locality* — a divergência do `store-routes` deixa de existir por construção. *Depth* — a interface é "me dê um app com duas Lojas"; a implementation absorve pooler, `sslmode`, cleanup e checagem de resíduo.

**Força:** Strong · **Conflito:** médio — `order-routes.test.ts` é a quinta cópia; a extração posterior é mecânica.

### 18.5 Adjacente: `requiredSecret` fora dos testes

A leitura de env também está duplicada em `packages/db/scripts/production-database-url.mjs:9` mais a variante `readEnvFileValue`. Os `test -n "$SECRET"` do CI são checagens em shell duplicadas entre os dois jobs e não cobrem as variáveis que os testes leem por conta própria. Um module único de leitura de env fecha isso junto de 18.4.

**Força:** Worth exploring.

## Comments

- 2026-07-29 — Ticket derivado de `/improve-codebase-architecture` rodado sobre `f64ea28`. Estes quatro achados foram separados dos demais por um critério só: são os que se agravam a cada ticket implementado. Os outros achados (Tickets 19 e 20) mantêm custo constante e podem esperar sem penalidade.
