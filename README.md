# Foode Delivery

Monorepo pnpm do Foode Delivery.

## Workspaces

- `apps/web`: Storefront e landing institucional em Next.js.
- `apps/admin`: Painel da Loja em Next.js.
- `apps/api`: API Fastify, incluindo `GET /health`.
- `packages/shared`: contratos Zod e tokens Foode.
- `packages/ui`: primitives compartilhadas outline-first.
- `packages/db`: Prisma Client, schema, migrations e helpers transacionais de RLS.

## Desenvolvimento

Requer Node.js 20.9 ou superior e pnpm 10.

```bash
pnpm install
pnpm dev
```

Os apps ficam em `http://localhost:3000`, `http://localhost:3001` e `http://localhost:3333`.
Copie os arquivos `.env.example` apenas quando precisar configurar observabilidade. Nenhum DSN é obrigatório localmente.

## Banco e isolamento por Loja

O Prisma é o owner único do schema e das migrations. Use `DATABASE_URL` somente
para migrations, seed e operações administrativas conscientes:

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

As migrations canônicas ficam somente em `packages/db/prisma/migrations`.
Antes do `db push`, o comando de deploy gera a representação plana e ignorada
que a Supabase CLI exige em `supabase/migrations`; ela não é uma segunda fonte.

A infraestrutura de banco da API recebe uma credencial de negócio distinta da
credencial administrativa. Esse login deve ser membro da role `foode_business`,
criada pela migration, e não pode ter `BYPASSRLS`. Cada operação de negócio
recebe um `store_id` confiável e o aplica com `set_config(..., true)` dentro da
própria transação; o contexto não permanece na conexão depois do request.

O Ticket 03 liga essa infraestrutura ao runtime por meio do JWT/JWKS e da
membership autenticada. Até essa identidade confiável existir, o entrypoint não
ativa rotas de negócio: `store_id` nunca deve ser aceito de header, query string
ou body arbitrários como substituto da autenticação.

O seed é idempotente e mantém o único Comerciante-modelo no modo
`pilot_platform`. A migration e os testes de RLS são executados exclusivamente
no Supabase de produção linkado pela CLI. Fixtures sintéticas usam identificadores
únicos e cleanup exato; não existe fallback para banco local.

## Verificação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
