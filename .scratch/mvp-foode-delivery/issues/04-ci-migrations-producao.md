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

