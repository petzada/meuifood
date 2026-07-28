# 03 — Autenticar Dono e Operador e aplicar RBAC

**What to build:** Dono e Operador entram no Painel por Supabase Auth, a API deriva membership, Loja e papel de forma confiável, e o Dono consegue convidar ou remover Operadores sem permitir que eles acessem capacidades além de Pedidos/status.

**Blocked by:** 02 — Instalar Loja, `store_id` e RLS efetiva.

**Status:** done

- [x] Dono e Operador usam convite, e-mail e senha no Supabase Auth.
- [x] A API valida JWT/JWKS e rejeita token ausente, inválido, expirado ou sem membership.
- [x] `store_id` e papel são derivados da membership persistida, nunca de header, query ou body arbitrário.
- [x] Dono pode listar membros, convidar Operador e remover seu acesso sem apagar o histórico operacional.
- [x] Operador acessa somente Pedidos e mudanças de status; configurações, Cardápio, Plano, equipe, relatórios e informações financeiras são negados pela API.
- [x] Remover um Operador invalida seu acesso nas requests seguintes, mesmo que a sessão já tenha sido emitida.
- [x] Testes HTTP verificam respostas e ausência de efeito persistido para RBAC negado e tentativa cross-Loja.
- [x] Esconder navegação no Painel é apenas UX e não substitui autorização no servidor.

## Comments

- 2026-07-28 — Exceção mínima autorizada para eliminar a circularidade com a
  Decisão 55, sem iniciar os demais requisitos do Ticket 04: o workflow deste
  ticket separa `quality` (lint, typecheck, testes sem dependência da migration
  e build) → `migrate` (dry-run e aplicação automática via Supabase CLI no
  project-ref `emdbvwylytduvuzvavgy`) → `integration` (suíte HTTP/RLS/RBAC
  completa no Supabase de produção). A prova remota não possui skip, mock ou
  fallback local; ela apenas executa depois da migration por dependência do DAG.
  O Ticket 04 permanece `ready-for-agent` e nenhum outro critério seu foi
  iniciado por esta exceção.
- 2026-07-28 — Gate operacional antes do primeiro push: configurar manualmente
  `SUPABASE_ACCESS_TOKEN` e `BUSINESS_DATABASE_URL` nos GitHub Actions secrets.
  A segunda URL deve usar uma senha forte exclusiva da role `foode_business`,
  nunca `SUPABASE_DB_PASSWORD`, e também deve ser configurada no serviço API da
  Railway. Nenhum valor é gerado, exibido ou gravado pelo agente/repositório.
- 2026-07-28 — Implementação concluída no PR #5: JWT/JWKS, membership por request,
  RBAC Dono/Operador, convite e remoção de Operadores, onboarding operacional do
  primeiro Dono e gestão funcional de Equipe no Painel. A resolução falha fechado
  quando uma identidade possui mais de uma membership, sem cristalizar uma
  cardinalidade global não decidida no domínio.
- 2026-07-28 — Revisões internas independentes registradas em
  `verification/reports/03-standards.md` e `03-spec.md`. Os oito achados foram
  classificados como procedentes e corrigidos: vocabulário, boundary de RBAC,
  seam legado, tipo de papel, índice redundante/cardinalidade, onboarding do Dono
  e UI de Equipe.
- 2026-07-28 — Evidência: `pnpm lint`, `pnpm typecheck`, `pnpm test:quality`,
  `pnpm test` e `pnpm build` verdes; API 22/22. A CI `30373345419` aplicou somente
  `20260728170000_membership_cardinality.sql` após dry-run e passou os jobs
  `quality`, `migrate` e `integration`. A CI final `30374025911` repetiu os três
  jobs com sucesso. Consulta independente confirmou resíduos RBAC=0 e RLS=0.
- 2026-07-28 — O status e os critérios permanecem abertos exclusivamente para o
  gate de verificação Claude/Sonnet. Não marcar `done` antes de o relatório externo
  do Ticket 03 ser produzido, lido e processado integralmente.
- 2026-07-28 — Reviews internos, checks locais e CI estão verdes. O ticket entrou
  na fila externa como `needs-review`, conforme o handshake de conclusão em duas
  fases; `done` permanece reservado ao processamento do relatório externo.
- 2026-07-28 — Relatório externo `03-auth-rbac-dono-operador.md` lido
  integralmente: veredito `conforme`, sem Bloqueador, Alto ou Médio. A única Nota,
  sobre `staff` no nome histórico da migration `20260728150000`, não exige ação:
  a migration já foi aplicada em produção e renomeá-la quebraria sua identidade;
  contratos, rotas, código e testes ativos já usam o vocabulário canônico. CI do
  handshake `30376179986` verde nos três jobs. Segunda fase concluída como `done`.
