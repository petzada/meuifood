# 19 — Aprofundar os modules da API e do acesso a dados

**What to build:** Os modules de `apps/api` e `packages/db` deixam de ser largos e rasos: a Pausa passa a valer dentro da transação que grava o Pedido, o protocolo de sessão RLS ganha um dono, `buildApp` volta a compor em vez de conter, e a delegação oca de `BusinessDatabase` desaparece.

**Blocked by:** 17 — Endurecer os portões de verificação do banco e do CI.

**Status:** todo

> **Ticket de custo constante.** Diferente do 18, estes achados não pioram sozinhos — pioram apenas na proporção em que o domínio cresce. Podem esperar o fim da fila de produto sem penalidade, **com uma exceção: 19.1 é um bug de corrida real e é follow-up direto do Ticket 08.**

- [ ] Pausa e horários são avaliados dentro da mesma transação que grava o Pedido.
- [ ] Um module é dono do protocolo de GUCs; nenhum call site escreve `set_config` à mão.
- [ ] `menu-routes.ts` e `store-routes.ts` existem — os testes que já têm esses nomes passam a testar os modules homônimos.
- [ ] `buildApp` compõe e registra; não contém regra de Cardápio nem de Loja.
- [ ] A política de acesso Dono/Operador tem um module e um tipo únicos; o privilégio de Operador deixa de ser expresso por omissão de argumento.
- [ ] A delegação método-a-método de `createBusinessDatabase` some; adicionar operação custa uma edição, não três.
- [ ] `provisionOwner` tem uma implementation só — a rota de convite de Operador deixa de reimplementá-la.

## Achados — API e acesso a dados

### 19.1 A decisão de Pausa está fora da transação que grava o Pedido — follow-up do Ticket 08

`apps/api/src/order-routes.ts` (gate antes de `createGuestPickupOrder`) · `apps/api/src/store-operation.ts:93-135` · `packages/db/src/orders.ts:217-233`

`calculateStoreOperation` é chamada por dois caminhos com dois `now()` diferentes: um para projetar o Storefront (`app.ts:178`) e outro para barrar o intake do Pedido. Nenhum dos dois roda dentro da transação que cria o Pedido — `createGuestPickupOrderRecord` (`orders.ts:229-233`) consulta só `pickupEnabled`, nunca `paused` nem os períodos.

O `CONTEXT.md` define Pausa como "bloqueia o checkout **imediatamente**". Hoje uma Pausa acionada entre as duas transações deixa o Pedido entrar. O item 2 do checklist do Ticket 08 — "a Loja precisa estar aberta e sem Pausa **no momento da criação**" — está cumprido no caminho feliz, não sob concorrência.

**Solução.** Levar `paused` + períodos para dentro da mesma leitura transacional que resolve a Loja pelo slug em `createGuestPickupOrderRecord`, e reduzir o gate da rota a pré-filtro de mensagem (não de autoridade).

**Ganhos.** *Locality* — "Pausa bloqueia checkout" passa a ter autoridade única, onde o efeito é gravado. *Seam* — hoje o invariante vaza de `packages/db` para `apps/api` e depende de a rota lembrar de chamá-lo. A corrida vira testável: hoje exige sincronizar dois relógios.

**Força:** Worth exploring · **Encaminhamento:** levar a quem implementou o Ticket 08; é correção do próprio ticket, não refactor paralelo.

### 19.2 O protocolo de GUCs que sustenta o isolamento por `store_id` está copiado em cada call site

`packages/db/src/index.ts:278-289` (`inStoreContext`), `:442-449`, `:535-542`, `:697-704` · `packages/db/src/orders.ts:221-237`, `:364-379`

`inStoreContext` cobre só o caso "já sei o `store_id`". Os caminhos públicos reescrevem à mão a sequência `SET LOCAL ROLE foode_business` → `set_config('app.public_slug', …)` → `set_config('app.current_store_id','')` → resolver a Loja → `set_config('app.current_store_id', store.id)`.

São quatro GUCs no total (`app.current_store_id`, `app.public_slug`, `app.current_user_id`, e `app.public_order_access_token` desde o Ticket 08) e nenhum module é dono deles. `resolveMembershipContext` chega a passar o UUID sentinela `00000000-0000-0000-0000-000000000000` por `inStoreContext` (`:700`) só para conseguir o `SET LOCAL ROLE`, dependendo da policy `store_members_identity_lookup` para o resultado não vir vazio.

O isolamento por `store_id` — o invariante mais caro do produto — depende de nenhuma das quatro cópias esquecer o reset para `''` antes do lookup, que alargaria a visibilidade em silêncio.

**Solução.** Um module dono do protocolo, com um modo por policy existente (contexto de Loja, lookup por slug público, lookup por token público, lookup de identidade); o call site escolhe o modo e nunca escreve `set_config`.

**Ganhos.** *Locality* máxima — hoje o bug mora na chamada, não na função. *Depth* — a interface é uma função; a implementation absorve a sequência que ninguém deveria reescrever. *Leverage* — cada rota pública nova herda o isolamento. O protocolo vira unidade testável; hoje só é provado indiretamente via HTTP contra Postgres real.

**Força:** Strong.

### 19.3 Colapsar a delegação oca de `BusinessDatabase`

`packages/db/src/index.ts:112-235` (interface, 31 membros) · `:291-913` (implementation transacional) · `:915-995` (delegação)

Toda operação existe em três lugares: assinatura na interface, corpo real dentro de `inStoreContext`, e um forwarder `withDatabase((database) => database.X(...))` sem nenhuma decisão — ~148 linhas de puro repasse. Adicionar um método custa três edições sincronizadas, e uma delas falhar é plausível. O Ticket 08 adicionou seis operações de Pedido e pagou o pedágio nas três regiões.

**Deletion test conclusivo:** apagar o objeto de delegação e expor um único seam de "abrir transação" concentra a complexidade em um ponto; hoje ela é apenas replicada 31 vezes.

**Solução.** Um adapter único que abra a transação e delegue à implementation transacional. A interface `BusinessDatabase` permanece — ela é o seam bom; o que sobra é a duplicação mecânica.

**Ganhos.** *Depth* — uma interface larga sobre uma implementation, não duas. *Leverage* — custo marginal de um método novo cai de três edições para uma. Qualquer fake de `BusinessDatabase` deixa de precisar reimplementar 31 métodos.

**Força:** Strong.

### 19.4 Extrair `menu-routes.ts` e `store-routes.ts` — os testes já existem, os modules não

`apps/api/src/app.ts:41-118` (schemas + `serializeMenuItem`), `:302-338` (rotas de Loja), `:340-618` (~280 linhas de rotas de Cardápio inline) · `menu-routes.test.ts` · `store-routes.test.ts`

Existem `menu-routes.test.ts` e `store-routes.test.ts` **sem** `menu-routes.ts` nem `store-routes.ts` — os testes já nomearam modules que ninguém criou. As rotas ficaram em `buildApp`, dentro de um `if (businessDatabase && verifyAccessToken)` de 440 linhas.

Ao lado, `registerStoreOperationRoutes` e `registerMenuCustomizationRoutes` mostram que o padrão de registro por module já foi escolhido; Cardápio e Loja simplesmente não migraram. `buildApp` mistura composição (logger, observability, wiring) com regra de Cardápio.

**Solução.** Mover para os modules que os testes já pressupõem, seguindo o formato de `registerMenuCustomizationRoutes`.

**Ganhos.** *Locality* — entender "o que acontece ao criar um item do Cardápio" hoje exige ler schema na linha 59, `serializeMenuItem` na 93 e a rota na 433. *Depth* — `buildApp` passa a ter interface pequena sobre implementation que só compõe. O nome do arquivo de teste passa a corresponder ao que testa.

**Força:** Strong.

### 19.5 Dar casa ao RBAC: `requireMembership` é uma closure sem module

`apps/api/src/app.ts:186-220` (definição) · `store-operation-routes.ts:12-16` · `menu-customization-routes.ts:59-66` · `order-routes.ts:41-49`

A regra de acesso Dono/Operador vive numa closure dentro de `buildApp`, e cada module de routes **redeclara estruturalmente** o mesmo tipo para recebê-la — `store-operation-routes.ts:15` usa o literal `"owner" | "operator"`, os outros dois usam `MembershipRole`.

Pior: "Operador só enxerga Pedidos" é expresso por **omitir o terceiro argumento** (`requireMembership(request, reply)` em `order-routes.ts`). O privilégio de Operador é efeito de esquecimento, invisível na leitura de qualquer arquivo isolado. Responder "quais rotas o Operador acessa?" exige varrer quatro arquivos procurando chamadas de dois argumentos.

**Solução.** Um module `auth-rbac.ts` que exporte a implementation e o tipo único, e declare a política por rota como dado (mapa rota → papel exigido) em vez de por presença/ausência de argumento em ~30 call sites.

**Ganhos.** *Locality* e *depth* — a interface encolhe para uma declaração; a implementation absorve token + membership + papel. O nome `auth-rbac.test.ts` já existe, mas testa via `buildApp` contra Supabase de produção; com o module nomeado dá para provar a tabela de papéis sem banco, deixando as provas caras só para o que é de fato RLS.

**Força:** Strong.

### 19.6 `provisionOwner` foi extraído para testabilidade; o bug mora na cópia dentro da rota

`apps/api/src/owner-provisioning.ts:12-24` · `provision-owner.ts:29-41` · `app.ts:266-280`

`owner-provisioning.ts` isola exatamente a sequência convidar → persistir membership → em falha, revogar convite. A rota `POST /team/operators/invitations` reimplementa a **mesma** sequência à mão para Operador, e é essa cópia — não a função pura — que roda em produção no fluxo que o comerciante usa. `owner-provisioning.test.ts:5-45` prova a versão que só um script CLI chama.

É o padrão que a skill nomeia: função pura extraída por testabilidade, com o bug real morando em como ela é (não) chamada.

**Solução.** A rota consome a mesma implementation, com o repositório sendo `addOperator`/`createOwnerMembership`; deletar a divergência.

**Ganhos.** *Locality* — a compensação de convite órfão passa a existir num lugar só. `auth-rbac.test.ts:422-444` já prova o rollback do Operador contra o Supabase real; unificando, o teste caro passa a validar a mesma implementation que o teste barato.

**Força:** Strong.

### 19.7 Colapsar o module de imagens do Cardápio nas rotas que o usam

`apps/api/src/menu-images.ts:1-65` · `app.ts:88-91`, `:441-446`, `:480-485`, `:521-537`, `:559-576`, `:582-618`

`menu-images.ts` exporta 5 símbolos para 65 linhas — é shallow. A validação está duplicada em duas linguagens: `imagePresignSchema` checa `contentLength: z.number().int()` e devolve `invalid_image_upload`; três linhas depois `assertMenuImageUploadRequest` recheca e devolve `invalid_image_size`.

O bug real não mora nas funções puras — mora na **ordem** em `app.ts:487-537`: `getMenuItem` antes de `updateMenuItem` só para descobrir a chave antiga, e a limpeza do objeto órfão repetida quase idêntica em update e delete, **já divergente**: `:523-528` compara `previousKey !== nextKey`, `:559-563` não compara nada.

**Solução.** Deletar `menu-images.ts` como module separado, mover as quatro funções para dentro de `menu-routes.ts` (19.4) e ter **um** ponto de validação de upload.

**Ganhos.** *Deletion test passa* — concentra no único lugar onde a ordem das operações importa. `menu-images.test.ts:11-66` prova o que nunca quebrou (regex de chave); falta prova de que a chave antiga é apagada em update **e** delete — hoje só um dos dois é coberto.

**Força:** Strong.

### 19.8 `storeId` passado duas vezes, com a segurança delegada inteiramente à policy

`packages/db/src/index.ts:156`, `:230-234`, `:431-441`, `:815-832` · `apps/api/src/app.ts:302-338`

`findStore` e `updateStoreName` recebem `context` (que já carrega `storeId`) **e** um `storeId` separado vindo de `request.params`. Quando divergem, `updateStoreName` executa `updateMany({ where: { id: storeId } })` sem nenhum filtro por `context.storeId` — quem impede a escrita cross-Loja é exclusivamente a policy `stores_tenant_isolation`, que faz o `count` cair para 0 e a função devolver `null`.

Nenhum código TypeScript confere a igualdade, e a única prova disso vive no preflight contra o banco real.

**Solução.** O `storeId` do `context` passa a ser o único; a rota compara o parâmetro da URL com o contexto e responde 404 antes de chegar ao banco, com a policy permanecendo como rede em profundidade.

**Ganhos.** *Locality* — o parâmetro redundante que convida ao erro desaparece do call site; a interface passa a expressar o invariante em vez de confiar no Postgres para corrigi-lo. A negação cross-Loja vira testável sem credenciais.

**Força:** Worth exploring.

### 19.9 `packages/db` não tem teste; a interface só é exercitável contra o Supabase de produção

`packages/db/package.json:22` (`vitest run --passWithNoTests`), nenhum `*.test.ts` em `packages/db/src/`

`BusinessDatabase` já é um seam nominal, mas existe uma única implementation. Toda prova de comportamento passa por `apps/api`, exigindo `BUSINESS_DATABASE_URL` apontando para o pooler real. `assertRestrictedRuntime` (`index.ts:306-331`) — a checagem que garante que a role não faz bypass de RLS — não tem cobertura possível fora de produção.

**Solução.** Separar as partes puras (mapeamento de views, decisões de `null`/`"has_items"`/`"not_found"`, ordenação) do acesso, e dar ao package uma implementation de teste da interface — sem abrir mão das provas remotas de RLS, que continuam sendo o único jeito honesto de provar policy.

**Força:** Worth exploring.

### 19.10 Tipos gerados do Prisma circulam fora de `packages/db`

`packages/db/src/index.ts:274-276` (`createAdministrativeDatabase` devolve `PrismaClient` cru) · consumidores em `apps/api/scripts/preflight-production-migrations.ts:43,127-168`, `provision-owner.ts:3,20`, e fixtures espalhadas pelos testes

Fora de `packages/db`, o `apps/api` monta fixtures com a API completa de models — inclusive `deleteMany` — sem passar por policy alguma, e os testes contornam nomear o tipo com `ReturnType<typeof createAdministrativeDatabase>`, sinal claro de que o tipo não deveria estar ali. Há ainda uma terceira construção de conexão divergente: `prismaClient` força `sslmode=require` e `uselibpqcompat` (`:266-272`), enquanto `seed.ts:13-14` monta `PrismaPg` cru sem nenhum dos dois.

**Solução.** Expor um module administrativo com a superfície estreita que os call sites realmente usam (provisionar Loja, criar fixture, limpar resíduo) e uma única construção de conexão; o `PrismaClient` deixa de ser retornado.

**Força:** Worth exploring.

### 19.11 A invariante de política de banco está partida em dois workspaces

`packages/db/scripts/migration-policy.mjs:89-134` · `apps/api/scripts/migration-preflight-policy.mjs:1-42` · `packages/db/scripts/production-state.mjs:1-14` · `apps/api/scripts/preflight-production-migrations.ts:15-17`

Aplicando o deletion test, nenhum dos dois "policy modules" some: um é allowlist de SQL estático, o outro é `pendingCanonicalMigrations` + `assertIsolationCatalog`. **Não há duplicação entre eles** — apesar dos nomes quase idênticos, que por si só induzem erro.

O que está duplicado é outra coisa: `pendingCanonicalMigrations` (remoto é prefixo do local) e `assertProductionState` (remoto é igual ao local) são a **mesma** invariante em dois instantes, em dois workspaces, com mensagens e testes independentes. E `assertIsolationCatalog` é puramente sobre o catálogo do Postgres, mas mora em `apps/api/scripts`. O sintoma está em `preflight-production-migrations.ts:15-17`: três imports por caminho relativo cru `../../../packages/db/scripts/*.mjs`, furando o `exports` de `@foode/db`.

**Solução.** Mover `assertIsolationCatalog` e a comparação de histórico para `packages/db/scripts`, e publicar um subpath de exports que a api consome como interface, em vez de alcançar o interior do outro workspace pelo filesystem.

**Força:** Worth exploring.

## Comments

- 2026-07-29 — Ticket derivado de `/improve-codebase-architecture` rodado sobre `f64ea28`. Nenhum achado contraria `docs/adr/0001` ou `0002`; 19.2, 19.8 e o 17.1 do Ticket 17 reforçam a Decisão 55 e o ADR 0002.
- **Lacuna de ADR sugerida:** não existe ADR sobre estratégia de teste. A dependência de Supabase de produção para *todo* teste de rota é consequência prática do ADR 0002, mas o ADR não a exige. Um "testes de rota provam RLS real; wiring prova-se sem banco" fecharia a lacuna que 18.4 e 19.9 tocam por ângulos diferentes.
