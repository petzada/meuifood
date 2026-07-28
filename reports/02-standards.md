# Standards — Ticket 02

## Findings

1. **Violação dura — migrations sem owner único**
   **Hunks:** `package.json:11`; `packages/db/prisma/migrations/**`; `supabase/migrations/**`.
   `db:migrate:deploy` aplica o diretório Supabase, enquanto as mesmas migrations são mantidas, byte a byte, também no diretório Prisma. Isso cria duas fontes editáveis e possibilidade de drift. Contraria `README.md:28` e o checklist do Ticket 02 (“Prisma é owner único do schema e das migrations”), além de `docs/decisoes/21-banco-orm-multitenant.md` (ORM Prisma) e `docs/decisoes/25-hospedagem-ci-ops.md` (migrations Prisma). O comentário recente exige Supabase CLI, mas não revoga ownership único. **Smell (julgamento): Duplicated Code** — ambos os pares de SQL foram duplicados integralmente. Manter uma fonte canônica e gerar/sincronizar deterministicamente o formato consumido pela CLI.

2. **Violação dura — cleanup não é exato em falha parcial**
   **Hunk:** `apps/api/src/store-routes.test.ts:64-82`.
   Os IDs só entram em `createdStoreIds` depois que as duas criações terminam. Se `storeA` for criada e `storeB` falhar, a primeira fixture fica em produção e `afterAll` não a remove. Contraria o Ticket 02, comentário de 2026-07-28, e `README.md:43-46`, que exigem cleanup exato e verificado. Registrar cada ID imediatamente após sua criação ou criar/limpar as fixtures numa estratégia que cubra falhas intermediárias.

3. **Violação dura — integração de negócio não existe no runtime real**
   **Hunk:** `apps/api/src/app.ts:50-89`.
   As rotas só são registradas se `businessDatabase` e `resolveStoreContext` forem injetados; porém o entrypoint existente chama `buildApp()` sem ambos. Assim, a API iniciada não usa `BUSINESS_DATABASE_URL`, não estabelece contexto por request e nem expõe essas rotas. Contraria `README.md:37-41` e `docs/decisoes/21-banco-orm-multitenant.md` (“Requests de negócio: Prisma com role sujeita a policies + contexto por request”).

4. **Julgamento — Duplicated Code**
   **Hunk:** `packages/db/src/index.ts:49-99`.
   `findStore` e `updateStoreName` repetem assunção de role, `set_config`, opções transacionais e projeção de Loja. Extrair um helper transacional de contexto RLS reduz drift nas próximas operações de negócio.

## Resolução

1. **Procedural, corrigido.** Prisma é a única fonte canônica. Um gerador
   determinístico materializa, em diretório ignorado, o formato exigido pela
   Supabase CLI antes do deploy; as duplicatas versionadas foram removidas.
2. **Procedural, corrigido.** O teste acrescenta cada ID ao conjunto de cleanup
   imediatamente após a criação correspondente. O `afterAll` verifica zero
   linhas pelos IDs e uma consulta remota independente confirmou zero fixtures
   com prefixo `fixture-rls-`.
3. **Não aplicável ao Ticket 02, justificado.** O Ticket 03 define como seu
   requisito a validação JWT/JWKS e a derivação de `store_id` e papel pela
   membership persistida. Sem essa identidade, ligar o entrypoint a uma fonte
   arbitrária de contexto reduziria a segurança. O Ticket 02 entrega e prova a
   infraestrutura RLS/HTTP; o `README.md` documenta que a ativação no runtime
   depende do resolvedor autenticado do Ticket 03 e proíbe header, query ou body
   como fonte de tenant.
4. **Procedural, corrigido.** `inStoreContext` concentra assunção de role,
   `set_config` e limites transacionais; `storeViewSelect` concentra a projeção
   compartilhada pelas operações.

Validação final: lint, typecheck, testes (incluindo isolamento HTTP/RLS no
Supabase de produção), build e dry-run remoto passaram.

## Verificação externa e notas

O veredito externo do Ciclo 5 foi **conforme**: 8/8 requisitos, nenhum
bloqueador/alto/médio e três notas, classificadas assim:

1. **Adiada para o Ticket 03.** A API ainda não possui runtime autenticado; o
   teste do Ticket 02 usa `assumeBusinessRole: true`. O Ticket 03, owner de
   JWT/JWKS, membership e ativação das rotas, também fica owner de tornar essa
   assunção obrigatória ou validar a credencial no startup.
2. **Adiada para o Ticket 03.** O login não privilegiado de
   `BUSINESS_DATABASE_URL` deve existir e ser validado antes do wiring real. A
   migration deste ticket cria a role sem login e permite apenas o rebaixamento
   administrativo consciente usado na prova.
3. **Procedural, corrigida.** Actions injeta `SUPABASE_DB_PASSWORD` e
   `SUPABASE_POOLER_URL` exclusivamente no passo `pnpm test`. O harness falha
   explicitamente sem a configuração completa e jamais usa skip/mock/fallback
   local. A execução real local em produção passou e deixou zero fixtures; o
   check da PR #4 repete a prova com os secrets configurados manualmente.
