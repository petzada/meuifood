# 17 — Endurecer os portões de verificação do banco e do CI

**What to build:** Os portões que hoje reportam verde sem verificar passam a afirmar o que prometem: RLS derivada do catálogo em vez de lista literal, scripts de produção cobertos por typecheck e lint, allowlist de SQL que distingue destrutivo de não classificado, e o job que aplica migration em produção deixa de rodar em todo PR.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada (merge do PR #17).

**Status:** todo

> **Executar antes do Ticket 09.** Este ticket não muda comportamento de produto — muda o que o CI consegue provar. Cada ticket de 09 a 16 que criar tabela com `store_id` passa hoje pelo portão sem que RLS seja afirmada. Adiar significa acumular tickets não verificados.

- [ ] O preflight deriva do catálogo do Postgres quais tabelas exigem RLS, sem lista literal, e falha se qualquer uma tiver `relrowsecurity` ou `relforcerowsecurity` falso.
- [ ] O portão é fail-closed: conjunto derivado vazio é erro, e `stores` tem de estar nele.
- [ ] `pnpm typecheck` cobre `apps/api/scripts/**`; o ESLint de `@foode/db` cobre `scripts`.
- [ ] A allowlist de SQL separa "destrói dado" de "incompatível com o preflight" e de "ainda não classificado", e reporta o statement original no diagnóstico.
- [ ] `REVOKE` e `COMMENT ON` deixam de ser rejeitados; `EXECUTE` só conta dentro de corpo dollar-quoted.
- [ ] A prova real de R2 deixa de passar verde sem executar, ou sai da suíte de CI com o README corrigido.
- [ ] O README declara Node 24, coerente com `.nvmrc`, `engines` e o CI.
- [ ] Em `pull_request` o CI roda `quality` + preflight transacional; o push persistente sai do PR.
- [ ] Em `push` de `master` o CI roda preflight, `supabase db push` e `integration`.
- [ ] Cada migration que cria tabela de negócio traz seu module de prova, chamado de dentro da transação do preflight.
- [ ] `migrate` e `integration` têm `timeout-minutes`.
- [ ] Decisão 55 atualizada com o novo fluxo (PR prova, master aplica).

## Achados — portões e infraestrutura

### 17.1 O preflight promete provar RLS da migration, mas a prova é uma lista literal

`apps/api/scripts/migration-preflight-policy.mjs:21-30` · `apps/api/scripts/preflight-production-migrations.ts:101-125`

`assertIsolationCatalog` carrega um `requiredTables` de 8 nomes escritos à mão (`stores`, `store_members`, `menu_categories`, `menu_items`, `menu_complement_groups`, `menu_complement_options`, `menu_additionals`, `store_operating_periods`), e a query em `preflight-production-migrations.ts:114-123` repete os mesmos 8 num `IN (...)`.

O Ticket 08 criou `orders` e `order_lines` com `ENABLE`/`FORCE ROW LEVEL SECURITY` e policies de tenant, e não tocou nenhum dos dois lugares — `git diff 5d3cf34^ 7dd3ae3 -- apps/api/scripts` sai vazio. As duas tabelas mais novas do sistema passaram pelo portão sem que uma linha de RLS fosse afirmada.

**Precisão sobre a gravidade:** não há vazamento hoje. A migration do Ticket 08 está correta (`20260728233000_ticket_08_pedido_guest_retirada/migration.sql:139-159`). O invariante está cumprido por disciplina do autor, não por verificação. Se a migration tivesse omitido o `FORCE`, ou concedido a policy à role errada, o CI ficaria verde e o vazamento cross-Loja só apareceria em produção.

A falha é silenciosa na direção errada: adicionar a tabela só ao `IN (...)` ainda verifica; adicionar só ao `requiredTables` falha ruidosamente. Mas esquecer os dois — o caso real, e o mais provável — não produz sinal nenhum.

**Solução.** Dentro da mesma transação do preflight (migrations pendentes já aplicadas), consultar quais tabelas *devem* ter RLS. Critério que cobre o schema inteiro: toda relação em `public` com coluna `store_id`, mais a própria `stores` (que é o tenant e usa `id`). Em `pg_class` juntado a `pg_attribute` por `attname = 'store_id'` (`attnum > 0 AND NOT attisdropped`), filtrando `relkind = 'r'` e `relnamespace = 'public'::regnamespace`. `order_lines` carrega `store_id`, então as dez tabelas atuais são cobertas, e uma tabela futura de pagamento ou evento entra sozinha.

**Ganhos.** *Leverage*: o module deixa de exigir que cada ticket lembre de dois lugares distantes do SQL que escreveu. *Locality*: a regra passa a morar no mesmo lugar que o fato que verifica. *Depth*: o portão cobre tabelas que ainda não existem — exatamente a classe que ele falhou em cobrir. O teste passa a afirmar a regra em vez de montar arrays de tabelas fake.

**Força:** Strong · **Conflito:** baixo — aditivo, em arquivos que o Ticket 08 não tocou.

### 17.2 O script que decide se produção pode ser tocada roda sem typecheck

`apps/api/tsconfig.json:5` · `packages/db/package.json:17`

O `include` do tsconfig da api para em `src`, então `pnpm typecheck` nunca vê `apps/api/scripts/**` — 450 linhas com `$queryRaw` tipado à mão, `app.inject` e casts, que é justamente o código que abre transação no Supabase de produção. Do lado do `@foode/db`, `lint` cobre só `src`, deixando os cinco `.mjs` de `scripts/` fora do ESLint.

**Correção de escopo:** o lint de `apps/api` **já cobre** `scripts` (`apps/api/package.json:9`). O gap de lint é só do `@foode/db`; o de typecheck é dos dois.

**Solução.** Estender o `include` (ou um `tsconfig.scripts.json` referenciado pelo `typecheck`) e o alvo do ESLint de `@foode/db`.

**Ressalva honesta.** Estender o typecheck **pode revelar erros preexistentes** nos scripts. Isso é o objetivo, mas significa que a mudança pode não ser de uma linha.

**Força:** Strong · **Conflito:** baixo.

### 17.3 A allowlist de SQL bloqueia endurecimento e produz falso positivo de destrutividade

`packages/db/scripts/migration-policy.mjs:21, 48-53` · `packages/db/prisma/migrations/20260728234000_ticket_08_order_enum_grants/`

Rodada contra SQL realista de Pedido:

- `GRANT USAGE, SELECT ON SEQUENCE ... TO foode_business` passa, mas `CREATE SEQUENCE` é rejeitado — dá para conceder sobre um objeto que a política proíbe criar.
- `REVOKE ALL ON TABLE "orders" FROM anon` é rejeitado como "estrutura não autorizada": não se consegue *apertar* privilégio.
- `CREATE TRIGGER ... EXECUTE FUNCTION set_updated_at()` é rejeitado como **"comando destrutivo SQL dinâmico EXECUTE"** — o `\bexecute\b` pega `EXECUTE FUNCTION` e a mensagem acusa destrutividade onde não há.
- `ALTER TYPE ... ADD VALUE` (um status de Pedido novo) e `COMMENT ON` também caem.
- Como `stripCommentsAndLiterals` zera identificadores quoted antes de montar a mensagem, o diagnóstico sai como `estrutura SQL não autorizada: ALTER TYPE ""` — sem o nome do objeto.

O commit `7ab210e` é a evidência do custo: a política empurrou o grant dos enums para uma segunda migration.

**Solução.** Separar as três listas hoje fundidas e reportar o statement original. `REVOKE` e `COMMENT ON` entram na allowlist; `EXECUTE` só conta dentro de corpo dollar-quoted.

**Força:** Strong · **Conflito:** baixo agora que o Ticket 08 fechou.

### 17.4 O preflight prova o passado, não a mudança

`apps/api/scripts/preflight-production-migrations.ts:186-234` · commit `7ab210e`

As provas HTTP do preflight são uma sequência fixa escrita nos Tickets 02 e 07. A migration do Ticket 08 criou três enums e duas tabelas; o preflight aplicou tudo na transação, rodou as provas de Loja e Cardápio, deu verde, e a CLI aplicou em produção. O `INSERT` de Pedido sob RLS só falhou depois, porque faltava `GRANT USAGE ON TYPE` — o erro que `7ab210e` corrigiu após o fato.

**Solução.** Exigir que cada migration que cria tabela de negócio venha com um module de prova (`store-operation-preflight.ts` já é o padrão) e falhar quando encontrar tabela nova sem prova correspondente. Combinado com 17.1, o conjunto derivado de tabelas vira a chave que diz quais provas são exigidas.

**Força:** Strong · **Conflito:** baixo.

### 17.5 Uma prova real que vira no-op verde, contra o que o README afirma

`apps/api/src/menu-image-storage.r2.test.ts:58-64` · `.github/workflows/ci.yml:99-109` · `README.md:90-91`

Sem as cinco variáveis `R2_*`, o teste cai em `expect(menuImageStorageFromEnvironment({})).toBeNull(); return;` e passa. O job `integration` não expõe nenhuma `R2_*`, então a prova de upload real nunca roda em CI — sempre verde. O README afirma que "a suíte nunca faz skip, usa mock ou recorre a banco local".

**Solução.** Expor `R2_*` no job e deixar o teste falhar quando faltarem (como os testes de banco já fazem), ou tirá-lo da suíte de CI e corrigir o README.

**Força:** Strong · **Conflito:** baixo · Contraria o espírito da Decisão 55 e o texto do README.

### 17.6 Menores

- **README fora de sincronia:** `README.md:16` pede "Node.js 20.9 ou superior"; `.nvmrc` diz `24`, `package.json:5-7` exige `>=24.0.0`, o CI usa `node-version: 24`. Só o README está errado — mas é o único lugar que um humano lê antes de instalar.
- **`test:quality` é lista literal de nomes de arquivo** (`apps/api/package.json:11`): o Ticket 08 teve de adicionar `src/order-idempotency.test.ts` à mão, e `verify-production-state.mjs` ganhou mais um `or slug like 'fixture-order-%'` pelo mesmo motivo. A distinção "teste puro" vs "teste que toca produção" é real e merece um seam explícito (sufixo, tag ou diretório), não um argumento de linha de comando que ninguém revisa.
- **Setup e build repetidos no CI:** os quatro steps de setup aparecem idênticos nos três jobs e `build:packages` executa cinco vezes por run, sem cache de `dist` nem `upload-artifact` entre jobs. O `cache: pnpm` só cobre o store.
- **Nenhuma config de deploy Railway versionada:** não há `railway.json`, `nixpacks.toml`, `Procfile` nem `Dockerfile`. Build e start command dos três serviços vivem só no dashboard — não versionados, não revisáveis. Não contraria o ADR 0002, que decide o *host*, não o formato da config.
- **Duas identidades do projeto Supabase:** `--project-ref emdbvwylytduvuzvavgy` inline em `ci.yml:72` e `project_id = "meuifood"` em `supabase/config.toml:5`. O `config.toml` é, no mais, o template default do `supabase init` — as seções de stack local descrevem um ambiente que a Decisão 55 proíbe existir.

## Comments

- 2026-07-29 — Ticket derivado de `/improve-codebase-architecture` rodado sobre `f64ea28` (master, base do deploy Railway) com o Ticket 08 em PR #17 e CI verde. Exploração em quatro agentes Opus paralelos; achados validados pelo agente principal contra o código.

- **Decisão do Dono (2026-07-29) — "PR prova, master aplica".**

  **O problema.** `.github/workflows/ci.yml:3-6, 28-30, 74`: o job `migrate` roda em `pull_request` sem filtro, então um PR não mergeado aplica sua migration no Supabase de produção. A partir daí, qualquer run de outra branch falha duas vezes — no preflight com "Histórico remoto não é prefixo das migrations Prisma canônicas" e no `integration` com "Histórico remoto de migrations divergente". O `concurrency: supabase-producao-migrations` serializa as runs, mas serialização evita corrida, não drift; a saída, quando acontece, é editar `supabase_migrations.schema_migrations` à mão. Um PR abandonado deixa a migration em produção para sempre.

  **A peça que resolve já existe.** `preflight-production-migrations.ts` abre transação no banco de produção (`:242`), aplica as migrations pendentes, sobe a API com `createTransactionalBusinessDatabase(transaction)` e roda provas HTTP reais — RLS cross-Loja, RBAC de Operador, horários e Pausa (`:188-234`) —, reverte com `throw rollbackProof` (`:240`) e confere resíduo zero (`:249-254`). Isso já é teste contra o banco de produção, com role e policies reais, sem persistir nada. A política de migration inclusive bloqueia `CONCURRENTLY` com a justificativa "não pode rodar dentro do preflight transacional": todo SQL que a política aceita é transacionável por construção. O que causa o drift não é o teste — é o `supabase db push --linked` rodando no mesmo PR.

  **O fluxo decidido.**
  - `pull_request` → `quality` + preflight transacional (aplica, prova, reverte).
  - `push` em `master` → preflight + `supabase db push --linked` + `integration`.
  - `timeout-minutes` nos dois jobs que tocam o banco.

  **Preserva o critério do Dono:** testa no banco de produção e somente nele, sem staging nem banco local (Decisão 55), e sem deixar resíduo antes do merge.

  **Custo aceito e mitigação — 17.4 vira pré-requisito, não melhoria opcional.** Hoje o `integration` roda os testes de rota com schema persistido em PR; com a mudança, isso passa a rodar só em `master`. Para não abrir janela sem cobertura, cada migration que cria tabela de negócio precisa trazer um module de prova chamado de dentro da transação do preflight, no padrão que `proveStoreOperationPreflight` (`:228`) já estabelece. Evidência de que isso funciona: o bug corrigido em `7ab210e` (faltava `GRANT USAGE ON TYPE`, e o `INSERT` de Pedido sob RLS quebrava com 500) passou pelo preflight justamente porque nenhuma prova exercia a criação de Pedido — com prova por migration, teria falhado no PR, dentro da transação, sem chegar a produção.

  **Risco residual.** Classes de erro que só aparecem com schema persistido e conexão nova ficam para o `integration` em `master`, que permanece como rede final — não desaparece, muda de momento.

  Nem a Decisão 25 nem a 55 afirmavam que o PR deveria *aplicar* a migration; a 55 diz "só depois de `quality` e preflight verdes". Atualizar a 55 com o fluxo acima faz parte deste ticket.
