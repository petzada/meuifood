# Foode Delivery

![Status](https://img.shields.io/badge/status-pausado-lightgrey) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green) ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white) ![Node](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)

SaaS de **canal próprio de delivery** para pequenos restaurantes: cardápio digital, pedidos e gestão da loja, cobrando assinatura fixa em vez de comissão de marketplace.

## Índice

- [Status do projeto](#status-do-projeto)
- [Demonstração](#demonstração)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos e instalação](#pré-requisitos-e-instalação)
- [Como utilizar](#como-utilizar)
- [Testes](#testes)
- [Contribuição](#contribuição)
- [Licença](#licença)
- [Autor e contato](#autor-e-contato)

## Status do projeto

⏸️ **Pausado**: o MVP avançou até a operação de pedidos e o cardápio com imagens; o desenvolvimento está parado desde julho de 2026.

## Demonstração

A loja divulga o próprio link ou QR code e o consumidor pede direto, sem marketplace no meio.

**Storefront (consumidor)**
- Landing institucional e página da loja com o cardápio.
- Pedido como convidado ou com conta.

**Painel da loja**
- Papéis **Dono** (acesso total) e **Operador** (só pedidos e status).
- Gestão do **cardápio** com personalização de itens e **imagens** (upload direto para o R2 por URL pré-assinada).
- Painel de **operação** com abertura e fechamento da loja e fila de **pedidos**.
- Configuração de **entrega** e da **equipe**.

**API**
- Isolamento por loja garantido pela camada de dados (`packages/db`): só há operações com contexto de Loja emitido pelo servidor, e testes de vazamento com duas Lojas rodam em todo PR.
- Fetch público só para Storefront, webhooks e `GET /health`; o Painel fala com a API por service binding (RPC).

O glossário do domínio está em [`CONTEXT.md`](CONTEXT.md) e as decisões em [`docs/`](docs/).

## Tecnologias utilizadas

| Camada | Tecnologias |
|---|---|
| Monorepo | **pnpm workspaces**, **TypeScript** |
| Front-end | **Next.js 16**, **React 19**, **Tailwind CSS 4** (`apps/web` e `apps/admin`) |
| Hospedagem | **Cloudflare Workers** (web e admin via **OpenNext**) |
| API | **Hono** em Worker (`apps/api`) |
| Dados | **Cloudflare D1** + **Drizzle** (`packages/db`) |
| Arquivos | **Cloudflare R2** (binding) |
| Observabilidade | **Sentry** (opcional), Workers Logs |
| Qualidade | **Vitest** (+ `@cloudflare/vitest-plugin` no CI), ESLint, Prettier, lefthook, GitHub Actions |

> Migração em andamento (decisão 59): o código Fastify/Prisma/Supabase em `apps/api/legacy-fastify` e `packages/db/legacy-prisma` é só referência e sai no Ticket 25.

## Pré-requisitos e instalação

**Pré-requisitos**

- **Node.js 24**
- **pnpm 10**
- Nenhum banco local nem Docker: testes com D1 rodam só no CI

**Instalação**

```bash
git clone https://github.com/petzada/meuifood.git
cd meuifood
pnpm install
```

O `pnpm install` instala os hooks do lefthook (pre-commit: formatação e lint dos arquivos em stage; pre-push: typecheck e testes ligados ao diff). Nenhum DSN do Sentry é obrigatório.

## Como utilizar

```bash
pnpm dev
```

| App | Endereço |
|---|---|
| Storefront (`apps/web`) | http://localhost:3000 |
| Painel da loja (`apps/admin`) | http://localhost:3001 |
| API (`apps/api`) | `wrangler dev` (`GET /health`) |

**Banco**

```bash
pnpm db:generate -- --name <nome>   # gera a migration SQL a partir de packages/db/src/schema.ts
```

As migrations são aplicadas só pelo CI: num D1 efêmero em todo PR e em produção pelo workflow manual `db-migrate` (veja `AGENTS.md`).

## Testes

```bash
pnpm lint             # ESLint + lint das migrations (expand/contract)
pnpm typecheck
pnpm test             # testes sem banco
pnpm test:related     # só os testes ligados ao diff (o pre-push roda este)
pnpm test:ci          # + testes com D1 no workerd (rodam no CI)
pnpm build            # bundle da api e next build
```

O GitHub Actions roda tudo em todo PR, inclusive o build OpenNext e a prova das migrations num D1 remoto efêmero; o deploy dos três Workers sai pelo CI a cada push na `master`, seguido de smoke.

## Contribuição

Contribuições são bem-vindas! Para propor uma melhoria:

1. Abra uma **issue** descrevendo o problema ou a ideia antes de começar algo grande.
2. Faça um **fork** e crie um branch a partir da `main`: `<tipo>/<nome-kebab>` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).
3. Use **commits semânticos** em português: `<tipo>(<escopo>): <descrição no imperativo>`.
4. Rode lint e testes antes de enviar (veja [Testes](#testes)).
5. Abra o **Pull Request** em *draft*, explicando o quê e o porquê. O merge é feito pelo autor.

Não inclua segredos (`.env`, chaves de API, tokens) em commits ou PRs.

## Licença

Distribuído sob a licença **MIT**, de código aberto. Isso significa que você **pode** usar, copiar, modificar, mesclar, publicar, distribuir, sublicenciar e até vender cópias do código, inclusive em projetos comerciais, **desde que** mantenha o aviso de copyright e o texto da licença. O software é fornecido "no estado em que se encontra", **sem garantias**, e o autor não se responsabiliza por danos decorrentes do uso.

Texto completo em [`LICENSE`](LICENSE).

## Autor e contato

**Marcio Petigrosso** ("petzada"): idealização e desenvolvimento.

- GitHub: [@petzada](https://github.com/petzada)
- LinkedIn: [in/petigrosso](https://www.linkedin.com/in/petigrosso)
