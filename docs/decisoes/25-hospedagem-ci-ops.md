# Decisão: hospedagem, CI, secrets e ops MVP

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #8  
**Depende de:** [17](17-monorepo-e-infra-preferencias.md), [18](18-stack-frontend.md), [19](19-stack-backend-api.md), [21](21-banco-orm-multitenant.md), [22](22-auth-lojista-e-consumidor.md), [23](23-realtime-pedidos-polling.md), [24](24-arquitetura-pagamentos.md)

## Decisão

### Runtime / dados

| Peça | Escolha |
| --- | --- |
| Apps | **3 serviços Railway:** `web`, `admin`, `api` |
| Dados / Auth | **Projeto Supabase novo** (Postgres + Auth + RLS) |
| Secrets | **Só** Railway variables + Supabase dashboard — nada no git |
| Envs | **Sem** `development` / `preview` / staging no MVP — fluxo: PR → CI verde → **produção** ([44](44-producao-only-sandbox-migrations-ci.md)) |
| CI | **GitHub Actions** em PR (lint / typecheck / testes mínimos / **validação de migrations Prisma**) — [44](44-producao-only-sandbox-migrations-ci.md) |
| Deploy | Integração **Railway** após CI ok |
| Gateways em dev | **Sandbox** Woovi/Asaas — [44](44-producao-only-sandbox-migrations-ci.md) |

### DNS (padrão)

- `foodedelivery.com.br` → `web` (storefront **+ landing** — [40](40-marketing-no-apps-web.md))
- `admin.foodedelivery.com.br` → `admin`
- `api.foodedelivery.com.br` → `api` (webhooks Woovi/Asaas públicos aqui)

### Ops **necessários** no MVP (checklist — sem overkill)

Derivados da stack já fechada; **não** incluir Redis só por hábito.

| Necessidade | Solução MVP | Por quê |
| --- | --- | --- |
| Imagens do cardápio | **Supabase Storage** (+ CDN público/signed URLs) | Já no ecossistema; evita S3/R2 extra |
| Auth e-mail (senha / magic link / convite) | **Supabase Auth** (SMTP padrão ou config mínima) | Já decidido em [22](22-auth-lojista-e-consumidor.md) |
| Webhooks PIX/cartão | Rotas na `api` + URL estável `api.…` | [24](24-arquitetura-pagamentos.md) |
| Idempotência / fila leve de eventos | **Tabela** `payment_events` (unique id) + processamento na `api` | Sem Redis/SQS |
| Reconciliação de cobranças pendentes | **Railway Cron** (serviço exit → hit autenticado / job na `api`) | Decisão [29](29-libs-ops-acrescimos-mvp.md); plano Railway já pago |
| Ledger piloto D+32 | Tabela/relatório interno | [24](24-arquitetura-pagamentos.md) |
| Logs | **Stdout Railway** + **Sentry** (free tier) | [29](29-libs-ops-acrescimos-mvp.md) |
| Backup DB | **Backup do plano Supabase** (US$20) | Não inventar pipeline |
| Migrations | Prisma migrate na pipeline/deploy da `api` **após** check de migrations no GH Actions ([44](44-producao-only-sandbox-migrations-ci.md)) | ORM [21](21-banco-orm-multitenant.md) |
| Healthcheck | `/health` na `api` (+ opcional nos Next) | Deploy Railway |

### Serviços Railway (contagem)

- Sempre-on: **`web`**, **`admin`**, **`api`** (3).
- Adicional MVP: **Cron** de reconciliação (short-lived) — não conta como worker Redis/fila.

### Explicitamente **fora** do MVP (ops)

- Redis / Valkey (poll 10s não precisa; WS é pós-MVP — [23](23-realtime-pedidos-polling.md))
- Worker Railway **sempre-on** separado (além do Cron exit)
- Staging / preview environments
- Datadog / OpenTelemetry completo (Sentry free **entra** — [29](29-libs-ops-acrescimos-mvp.md))
- Multi-região, K8s, filas cloud (SQS/Rabbit)
- CDN à parte além do que Storage/Railway já derem

### Atualização vs âncora [17](17-monorepo-e-infra-preferencias.md)

- Redis Railway deixa de ser “default quando precisar cache” no checklist do MVP — **só se aparecer dor medida** (rate limit, cache de cardápio sob carga).
- Preferência Railway + Supabase **mantida**.

## Rejeitado

- Deploy sem CI em PR.
- Ambiente staging obrigatório antes de validar produto.
- Empilhar Redis/worker sempre-on no dia 0 sem necessidade.
- `node-cron` embutido na API como caminho principal (Cron Railway preferido — [29](29-libs-ops-acrescimos-mvp.md)).
