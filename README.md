# Foode Delivery

![Status](https://img.shields.io/badge/status-pausado-lightgrey) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green) ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify) ![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)

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
- Isolamento por loja garantido no banco com **Row Level Security**: cada transação recebe o `store_id` confiável do usuário autenticado (JWT verificado contra o JWKS do Supabase).
- Pedidos idempotentes e health check em `GET /health`.

O glossário do domínio está em [`CONTEXT.md`](CONTEXT.md) e as decisões em [`docs/`](docs/).

## Tecnologias utilizadas

| Camada | Tecnologias |
|---|---|
| Monorepo | **pnpm workspaces**, **TypeScript** |
| Front-end | **Next.js 16**, **React 19**, **Tailwind CSS 4** (`apps/web` e `apps/admin`) |
| API | **Fastify 5**, **Zod**, Pino (`apps/api`) |
| Dados | **Prisma 7** + **Postgres (Supabase)** com RLS (`packages/db`) |
| Arquivos | **Cloudflare R2** (SDK S3) |
| Observabilidade | **Sentry** |
| Qualidade | **Vitest**, ESLint, GitHub Actions |

## Pré-requisitos e instalação

**Pré-requisitos**

- **Node.js 24** ou superior
- **pnpm 10**
- Um projeto Supabase apenas para usar banco e autenticação reais

**Instalação**

```bash
git clone https://github.com/petzada/meuifood.git
cd meuifood
pnpm install
```

Copie os arquivos `.env.example` (raiz, `apps/api`, `apps/admin`, `apps/web`) só quando precisar configurar banco, autenticação, R2 ou Sentry: nenhum DSN é obrigatório para subir os apps.

## Como utilizar

```bash
pnpm dev
```

| App | Endereço |
|---|---|
| Storefront (`apps/web`) | http://localhost:3000 |
| Painel da loja (`apps/admin`) | http://localhost:3001 |
| API (`apps/api`) | http://localhost:3333 (`GET /health`) |

**Banco**

```bash
pnpm db:generate               # gera o Prisma Client
pnpm db:migrations:validate    # valida as migrations canônicas
pnpm db:seed                   # dados iniciais (usa DATABASE_URL)
```

A API exige `BUSINESS_DATABASE_URL` com um login sem `BYPASSRLS`, membro da role `foode_business`; ela se recusa a iniciar com credencial privilegiada.

## Testes

```bash
pnpm test:quality     # suíte de qualidade de API, painel, storefront e pacotes
pnpm typecheck
pnpm lint
```

Cada app e pacote também roda `pnpm test` (Vitest) isoladamente. O GitHub Actions executa as verificações em todo PR.

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
