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

O runtime da API exige `BUSINESS_DATABASE_URL` com o login exclusivo
`foode_business`. Toda transação assume essa role obrigatoriamente; antes de
escutar, a API também rejeita credencial cuja sessão seja `postgres`, cuja role
efetiva não seja `foode_business` ou que possua `BYPASSRLS`. A senha desse login
é provisionada manualmente no Supabase e mantida apenas nos secrets do GitHub
Actions e nas variables da API na Railway, nunca em migration ou no Git.

JWTs do Painel são verificados pela API contra o JWKS do Supabase, incluindo
assinatura ES256, issuer, audience e expiração. `store_id` e papel vêm da
membership consultada a cada request, portanto remover um Operador invalida o
acesso mesmo para uma sessão já emitida. O secret `SUPABASE_SERVICE_ROLE_KEY`
fica isolado no adapter Auth Admin usado para convites; queries de Loja e equipe
continuam no Prisma com a role RLS.

O Painel usa `@supabase/ssr` para cookies/PKCE, e-mail e senha. Configure somente
as variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no admin, além de `API_URL`. O callback de
convite é `/auth/confirm`, seguido da definição de senha.

O seed é idempotente e mantém o único Comerciante-modelo no modo
`pilot_platform`. A migration e os testes de RLS são executados exclusivamente
no Supabase de produção linkado pela CLI. Fixtures sintéticas usam identificadores
únicos e cleanup exato; não existe fallback para banco local.

Na Actions, os passos remotos recebem somente os secrets necessários e falham
explicitamente se algum estiver ausente; a suíte nunca faz skip, usa mock ou
recorre a banco local. Quando uma migration altera RLS/RBAC, o workflow executa
um DAG fail-closed: `quality` (sem secrets) precisa ficar verde antes de
`migrate`; `migrate` faz dry-run e aplica pela Supabase CLI no projeto Foode
Delivery; somente depois `integration` executa toda a prova HTTP/RLS/RBAC em
produção. Esse fluxo usa `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_POOLER_URL` e `BUSINESS_DATABASE_URL` nos passos mínimos indicados no
workflow.

## Verificação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
