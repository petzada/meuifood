# Ticket 04 — Review de Spec

**Fixed point:** `origin/master` (`2ad21b72fb9831fe05d67aa7a87d8074cc36e4ac`)

**Diff:** `git diff origin/master...HEAD`

**Review:** subagente independente, eixo Spec

## Achados originais

1. **Crítica:** `db push` ocorria antes da prova do efeito das migrations sobre
   RLS/RBAC; o caminho feliz posterior não provava fail-closed antes da mutação.
2. **Alta:** o gate dos três deploys Railway não estava comprovado; README não
   substitui `Wait for CI` no dashboard nem prova ausência de pre-deploy migration.
3. **Média:** não havia garantia externa de que toda mudança passaria pelo gate;
   branch protection/rulesets não puderam ser confirmados.

Nenhum scope creep foi identificado.

## Classificação e resolução

1. **Procedente — corrigido.** Antes do `db push`, o job agora calcula as
   migrations pendentes pelo histórico remoto, aplica seu SQL dentro de uma
   única `Prisma.TransactionClient`, valida role e RLS no catálogo, cria duas
   Lojas sintéticas e injeta o `BusinessDatabase` real dessa mesma transação no
   Fastify. A prova cobre Dono, Operador, leitura/escrita cross-Loja e ausência de
   efeito. Um sentinel força rollback mesmo no caminho verde; conexão
   independente exige resíduos zero. A integração completa continua pós-push.
2. **Adiado — gate externo ainda não atendido.** Requer confirmação manual de
   **Wait for CI** em `web`, `admin` e `api`, todos em `master`/produção, e de que
   nenhum deles possui pre-deploy migration. Não há credencial/autoridade Railway
   disponível neste trabalho; documentação no repositório não encerra o achado.
3. **Adiado — decisão externa ainda não atendida.** O repositório é privado e as
   APIs de branch protection, rulesets e rules da `master` retornam HTTP 403 com
   exigência de GitHub Pro ou repositório público. O usuário precisa escolher
   upgrade/publicação ou aceitar formalmente o gate operacional baseado no
   workflow de `push` + Railway Wait for CI. Nenhuma configuração foi mutada.

## Resultado

Um achado procedente foi corrigido. Dois permanecem adiados e impedem
`needs-review`/`done` até ação ou decisão explícita do usuário.
