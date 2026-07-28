# Decisão: migrations no Supabase de produção após CI verde, sem apagar dados

**Data:** jul/2026 · **Status:** decidido · **Sessão:** implementação ticket 02
**Depende de:** [44](44-producao-only-sandbox-migrations-ci.md) · [25](25-hospedagem-ci-ops.md) · [21](21-banco-orm-multitenant.md)

**Supersede:** a linha "Migrations Prisma" de [44](44-producao-only-sandbox-migrations-ci.md) e a responsabilidade de migration atribuída à `api` em [25](25-hospedagem-ci-ops.md)

## Decisão

| Item | MVP |
| --- | --- |
| Banco | **Um só**: Supabase de produção. Sem Postgres local, Docker, banco efêmero, simulador ou fallback |
| Aplicação de migration | **Automática no banco remoto de produção**, e **só** depois de `quality` e preflight transacional verdes |
| Preflight | Migrations pendentes são aplicadas numa transação isolada no próprio Supabase, provas HTTP/RLS/RBAC usam a mesma visão e o fluxo sempre executa rollback antes do `db push` |
| CI vermelho relacionado ao banco | **Nenhuma mudança é persistida** — falha de validação, preflight ou integração bloqueia a próxima ação |
| Migrations destrutivas | **Proibidas.** Nenhuma migration apaga dados reais: sem `DROP TABLE`/`DROP COLUMN` com dado, sem `DELETE`/`TRUNCATE` de dados de negócio. Mudança destrutiva exige **nova decisão explícita** |
| Ferramenta | Migrations aplicadas via **Supabase CLI**; **Prisma continua owner do schema e da autoria das migrations** ([21](21-banco-orm-multitenant.md)) — a CLI é o mecanismo de aplicação, não a fonte do schema |
| Testes Seam 1 / Seam 2 | Rodam contra o **Supabase de produção**, com fixtures de **identificador sintético único** e **cleanup exato e verificado** |
| Cleanup de fixture | Apagar as **próprias** linhas sintéticas criadas pelo teste **não** é "apagar dados" no sentido proibido acima |

## Por quê

- Founder solo com ambiente único ([44](44-producao-only-sandbox-migrations-ci.md): só produção, sem staging/preview). Um banco só elimina divergência de policies entre ambientes — RLS é a invariante mais cara de errar e a que menos tolera "funcionava no local".
- O risco de dado fica contido pelas travas combinadas: validação estática
  fail-closed, prova do efeito das migrations pendentes com rollback obrigatório,
  CI verde antes de persistir e migration que nunca destrói dado.

## Rejeitado

- Postgres efêmero / local / Docker para a Seam 1 (texto anterior da spec).
- Migration destrutiva automática, mesmo com CI verde.
- Aplicar migration com CI vermelho relacionado ao banco.

## Impacto em documentos

- `spec.md` — Testing Decisions, Seam 1: já reflete esta decisão.
- [44](44-producao-only-sandbox-migrations-ci.md) — linha "Migrations Prisma" substituída por esta; o restante de 44 (só produção, sandbox de gateways, sem `is_demo`) permanece vigente.
- [25](25-hospedagem-ci-ops.md) — aplicação sai do deploy da `api` e passa ao GitHub Actions; os três autodeploys Railway aguardam o workflow verde.
- Tickets afetados: [02](../../.scratch/mvp-foode-delivery/issues/02-loja-store-id-rls.md) e [04](../../.scratch/mvp-foode-delivery/issues/04-ci-migrations-producao.md).
