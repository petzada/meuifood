# Foode Delivery

Monorepo pnpm do Foode Delivery.

## Workspaces

- `apps/web`: Storefront e landing institucional em Next.js.
- `apps/admin`: Painel da Loja em Next.js.
- `apps/api`: API Fastify, incluindo `GET /health`.
- `packages/shared`: contratos Zod e tokens Foode.
- `packages/ui`: primitives compartilhadas outline-first.
- `packages/db`: ponto de entrada do banco, sem schema de domínio neste bootstrap.

## Desenvolvimento

Requer Node.js 20.9 ou superior e pnpm 10.

```bash
pnpm install
pnpm dev
```

Os apps ficam em `http://localhost:3000`, `http://localhost:3001` e `http://localhost:3333`.
Copie os arquivos `.env.example` apenas quando precisar configurar observabilidade. Nenhum DSN é obrigatório localmente.

## Verificação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
