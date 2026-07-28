# 04 — Bloquear produção com CI e migrations validadas

**What to build:** Toda mudança passa por um gate GitHub Actions reproduzível, com qualidade, build, migrations e provas de RLS/RBAC antes dos três deploys Railway e da aplicação de migrations em produção.

**Blocked by:** 03 — Autenticar Dono e Operador e aplicar RBAC.

**Status:** ready-for-agent

- [ ] O workflow instala pelo lockfile e executa lint, typecheck, testes e build dos workspaces relevantes.
- [ ] O CI sobe Postgres descartável, aplica todas as migrations do zero e roda as provas RLS/RBAC com role não privilegiada.
- [ ] Migration inválida, drift detectável ou quebra de isolamento falha antes de qualquer ação de produção.
- [ ] Apenas a API executa migrations de produção com credencial dedicada antes de aceitar tráfego.
- [ ] `web` e `admin` não aplicam migrations e requests de negócio continuam sujeitas a RLS.
- [ ] Falhas ficam visíveis em stdout/Sentry sem revelar credenciais.
- [ ] O fluxo mantém exatamente três serviços sempre-on na Railway, sem staging, preview ou Loja `is_demo`.

## Comments

- 2026-07-28 — Correção conforme `docs/decisoes/55-migrations-supabase-producao-ci.md`, que supersede a linha "Migrations Prisma" de `docs/decisoes/44-producao-only-sandbox-migrations-ci.md`. Dois requisitos acima estão superseded e valem como abaixo:
  - **Não vale** "O CI sobe Postgres descartável": não existe banco descartável, local, Docker, efêmero, simulador ou fallback. O banco é único — o **Supabase de produção**. O CI aplica as migrations e roda as provas RLS/RBAC contra ele, com role não privilegiada, usando fixtures de identificador sintético único e cleanup exato e verificado.
  - **Não vale** "Apenas a API executa migrations de produção": quem aplica é o **GitHub Actions via Supabase CLI**, automaticamente, depois do verde. `web`, `admin` e `api` não aplicam migrations — a API perde essa responsabilidade de boot. Prisma continua owner do schema e da autoria das migrations; a CLI é só o mecanismo de aplicação.
  - **Migration nunca destrói dado:** `DROP TABLE`/`DROP COLUMN` com dado, `DELETE` ou `TRUNCATE` de dado de negócio exigem decisão explícita nova. Apagar as próprias fixtures sintéticas de teste não é destruição de dado.
  - **CI vermelho relacionado ao banco bloqueia a aplicação:** nada é aplicado em produção sem o verde.

