# Revisão Spec — Ticket 02

## Findings

1. **[Requisito implementado incorretamente] Ownership de migrations não é único.** O Ticket 02, linha 9, e a spec, linha 133, exigem Prisma como owner do schema e das migrations. Porém, o diff mantém duas cópias byte a byte das mesmas migrations em `packages/db/prisma/migrations/` e `supabase/migrations/`; `packages/db/prisma.config.ts:7-9` declara a primeira árvore, enquanto `package.json` executa `supabase db push --linked`, consumindo a segunda. Sem geração/sincronização automatizada, existem duas fontes editáveis e sujeitas a divergência.

2. **[Requisito parcial] A role de negócio não está instalada no runtime real da API.** Ticket, linha 13, e spec, linha 135, exigem que a API estabeleça contexto confiável por request usando role sujeita às policies. `packages/db/src/index.ts:39-99` oferece o helper, mas `apps/api/src/server.ts:4` chama `buildApp()` sem `BUSINESS_DATABASE_URL`, banco ou resolvedor de contexto; `apps/api/src/app.ts:50-51` só registra as rotas quando ambos são injetados. Assim, o comportamento existe apenas no harness de teste, não na inicialização executada por `dev/start`.

3. **[Requisito implementado incorretamente] Cleanup das fixtures não é exato em falha parcial.** Ticket, comentário da linha 20, e spec, linha 173, exigem cleanup exato e verificado no Supabase de produção. Em `apps/api/src/store-routes.test.ts:64-82`, os IDs só são adicionados a `createdStoreIds` depois que as duas Lojas foram criadas. Se a criação da Loja B falhar, a Loja A já persiste, mas seu ID nunca entra no cleanup de `:85-95`, deixando resíduo em produção.

**Scope creep:** nenhum comportamento não solicitado material identificado.

## Resolução

1. **Procedural, corrigido.** `packages/db/prisma/migrations` passou a ser a
   única fonte editável. `packages/db/scripts/sync-supabase-migrations.mjs`
   gera deterministicamente a representação plana, ignorada pelo Git, antes de
   `supabase db push`; as cópias antes versionadas em `supabase/migrations`
   foram removidas.
2. **Não aplicável ao Ticket 02, justificado.** O Ticket 03 é explicitamente o
   owner da validação JWT/JWKS e da derivação confiável de Loja e papel a partir
   da membership. O Ticket 02 entrega o banco de negócio, a role não
   privilegiada, o contexto transacional e a integração HTTP injetável que
   prova RLS. Ativar essas rotas no entrypoint antes do Ticket 03 exigiria uma
   identidade falsa ou aceitar `store_id` de header, query ou body, violando o
   próprio Ticket 03. A fronteira foi tornada explícita no `README.md`: o
   runtime só será ligado quando houver resolvedor autenticado confiável.
3. **Procedural, corrigido.** Cada ID de fixture agora é registrado
   imediatamente depois de sua criação, portanto o `afterAll` também remove a
   Loja A se a criação da Loja B falhar. A suíte remota passou e a consulta
   independente posterior confirmou `fixture_rls_residue_count=0`.

Validação final: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`
passaram; o dry-run da Supabase CLI informou o banco remoto atualizado, sem
migrations pendentes.

## Verificação externa e notas

O Ciclo 5 registrou o Ticket 02 como **conforme**, com 8/8 requisitos, zero
bloqueadores, zero achados altos/médios e três notas:

1. **Adiada, owner Ticket 03:** `assumeBusinessRole` permanece opt-in. Neste
   ticket a prova passa `true` explicitamente e o entrypoint não ativa rotas de
   negócio. Ao ligar JWT/JWKS e membership, o Ticket 03 deve tornar a assunção
   da role obrigatória ou rejeitar startup com credencial que possa bypassar
   RLS.
2. **Adiada, owner Ticket 03:** o login real de `BUSINESS_DATABASE_URL` ainda
   não é provisionado. A role `foode_business` e o rebaixamento administrativo
   satisfazem a prova atual; provisionar e validar o login não privilegiado é
   pré-condição explícita para o wiring de runtime do Ticket 03.
3. **Procedural, corrigida no Ticket 02:** o harness aceita apenas as duas
   credenciais de produção por ambiente no CI ou os arquivos locais ignorados
   já ligados à produção. Configuração ausente/parcial falha; não existe skip,
   mock ou banco local. A suíte real passou localmente contra Foode Delivery e
   confirmou cleanup independente com zero resíduos; o check da PR #4 fornece
   a prova automática equivalente com os Repository Actions secrets.
