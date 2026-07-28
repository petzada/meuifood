# 02 — Instalar Loja, `store_id` e RLS efetiva

**What to build:** O Postgres recebe o modelo mínimo de Loja e membership, com Prisma como owner do schema, `store_id` canônico, RLS efetiva e seed idempotente do único Comerciante-modelo em `pilot_platform`.

**Blocked by:** 01 — Bootstrapar monorepo e identidade Foode.

**Status:** done

- [x] Prisma possui ownership único de schema, migrations e client.
- [x] Loja representa um CNPJ/tenant e possui Slug globalmente único e Modo de cobrança `pilot_platform`, `baas` ou `merchant_own_account`.
- [x] Membership distingue Dono e Operador sem introduzir Workspace, `workspace_id` ou `merchant_id` como tenant.
- [x] O seed cria exatamente o Comerciante-modelo em `pilot_platform` e pode ser executado novamente sem duplicação.
- [x] Requests de negócio usam uma role não privilegiada, sujeita às policies, com contexto `store_id` local à transação.
- [x] Credencial privilegiada fica restrita a migrations e operações administrativas conscientes.
- [x] Testes contra Postgres real usam duas Lojas sintéticas e provam que uma não lê nem altera linhas da outra.
- [x] Mock de Prisma, banco sem policies ou `service_role` padrão não satisfazem a prova de isolamento.

## Comments

- 2026-07-28 — Decisão operacional mais recente: migrations usam Supabase CLI e os testes HTTP/RLS rodam exclusivamente no Supabase de produção. Não usar Postgres local, Docker, banco efêmero, simulador ou fallback. Fixtures sintéticas devem ter identificadores únicos e cleanup exato verificado.
- 2026-07-28 — Implementação concluída e revisada. Prisma permanece como owner
  único; a representação da Supabase CLI é gerada e ignorada. Migrations e seed
  idempotente foram aplicados em produção, a role `foode_business` foi validada
  sem privilégios de bypass, e os testes HTTP provaram isolamento de leitura e
  escrita entre duas Lojas. Cleanup remoto independente confirmou zero
  fixtures. Os relatórios `reports/02-spec.md` e `reports/02-standards.md` foram
  processados; a ligação do resolvedor autenticado ao entrypoint permanece no
  Ticket 03, que é owner de JWT/JWKS e membership.
- 2026-07-28 — O workflow injeta `SUPABASE_DB_PASSWORD` e
  `SUPABASE_POOLER_URL` somente no passo de testes. Os valores são configurados
  manualmente como GitHub Actions secrets; ausência ou configuração parcial
  falha explicitamente, sem skip, mock ou fallback local.
- 2026-07-28 — Verificação externa do Ciclo 5: **conforme**, 8/8 requisitos,
  zero bloqueadores/altos/médios e três notas processadas. A execução real foi
  repetida em Foode Delivery com cleanup independente igual a zero. As notas de
  `assumeBusinessRole` opt-in e do login `BUSINESS_DATABASE_URL` foram adiadas
  com owner explícito no Ticket 03, pois são pré-condições do wiring
  JWT/JWKS/membership; a nota de execução foi resolvida pelo harness/Actions do
  Ticket 02, sem skip, mock ou fallback local.
- 2026-07-28 — Correção da cronologia da prova RLS na PR #4:
  - No HEAD `57087cc`, a CI estava vermelha porque o runner não possuía as
    credenciais necessárias; a prova remota não chegou a executar.
  - A partir de `170fbab`, o workflow passou a consumir no passo `pnpm test` os
    GitHub Actions secrets configurados manualmente, e a prova RLS passou a
    executar de fato na CI contra Foode Delivery.
  - A CI de `170fbab` confirmou `store-routes.test.ts` com dois testes
    executados, API 4/4 sem skip e cleanup independente com resíduo zero.
