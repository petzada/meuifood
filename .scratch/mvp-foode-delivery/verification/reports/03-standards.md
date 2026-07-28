# Ticket 03 - revisão de padrões

**Base fixa:** `origin/master` em `a5c99af`

## Resultado

### 1. Vocabulário canônico `staff`

**Classificação:** procedente, violação dura.

`CONTEXT.md` reserva Operador, Equipe, membro e membership. A implementação foi
renomeada para `MembershipContext`, `TeamMemberView`, `MemberInvitationService`,
`resolveMembershipContext`, `listTeamMembers` e rotas `/team/*`. O único nome
remanescente está no diretório da migration `20260728150000_staff_identity_lookup`,
já aplicado em produção antes desta revisão; renomear uma migration aplicada
quebraria a identidade do histórico. Nenhum código ou contrato ativo usa o termo.

### 2. Autenticação e autorização repetidas nos handlers

**Classificação:** procedente.

Os handlers agora atravessam um único boundary `requireMembership`, responsável
por Bearer, verificação do token, resolução da membership e política opcional de
papel. As rotas expressam somente `owner` quando necessário.

### 3. Implementação paralela de `/stores` via `resolveStoreContext`

**Classificação:** procedente.

A seam foi removida de `BuildAppOptions` e da API. Os testes de isolamento usam a
mesma superfície JWT + membership da aplicação, com verificador de token injetável
e memberships sintéticas persistidas no Supabase.

### 4. Papel como união primitiva repetida

**Classificação:** procedente.

Apps usam `MembershipRole` de `@foode/shared`; a camada Prisma usa o tipo gerado
do enum canônico do schema. Não restam uniões `"owner" | "operator"` duplicadas.

### 5. Índice redundante em `store_members.user_id`

**Classificação:** procedente, absorvido pela correção de cardinalidade da revisão
de especificação.

A unicidade global não é autorizada pelo domínio e foi removida pela migration
`20260728170000_membership_cardinality`. O índice não único existente permanece
para a busca por identidade, sem duplicar índices equivalentes.

## Conclusão

Todos os achados procedentes foram corrigidos. Não houve achado adiado.

## Evidência posterior às correções

- `pnpm lint`, `pnpm typecheck`, `pnpm test:quality`, `pnpm test` e `pnpm build`:
  verdes localmente; a suíte API completa passou 22/22.
- CI `30373345419`: `quality`, `migrate` e `integration` verdes; 22/22 testes da
  API no Supabase de produção.
- CI final `30374025911`: `quality`, `migrate` e `integration` verdes depois do
  ajuste de timeout da prova RLS.
- Resíduo independente: zero Lojas sintéticas `fixture-rbac-*` e
  `fixture-rls-*`.
