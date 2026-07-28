# 07 — Aplicar horários e Pausa no Canal próprio

**What to build:** O Dono configura funcionamento semanal e Pausa, enquanto o Consumidor continua vendo o Cardápio e recebe o motivo correto quando a ação de checkout está bloqueada.

**Blocked by:** 05 — Gerenciar e publicar o Cardápio da Loja.

**Status:** needs-review

- [ ] Dono configura períodos válidos por dia e dias fechados.
- [ ] Pausa tem efeito imediato sem alterar ou apagar horários.
- [x] O estado canônico distingue Loja aberta, fora do horário e em Pausa.
- [x] Fora do horário inclui próximo horário de abertura quando calculável.
- [x] Cardápio permanece visível em todos os estados e não oferece agendamento.
- [ ] Operador não vê nem altera horários ou Pausa.
- [ ] Testes usam relógio controlável e duas Lojas para provar estados e isolamento.

## Comments

- 2026-07-28 — Implementação local concluída nos commits `5d29bc8`,
  `1d0c29e` e `f8895d3`. Evidências executadas: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:quality`, `pnpm build`, validação de migrations e testes
  temporais/UI específicos. O preflight transacional e `pnpm test` completo
  foram tentados, mas as provas remotas não iniciaram porque este worktree
  isolado não possui as credenciais do Supabase de produção. Por isso os itens
  que dependem de persistência/RLS/RBAC reais permanecem desmarcados até a
  rodada final após o Ticket 06.
- 2026-07-28 — Gate de integração executado sobre `origin/master`
  `8175c4a`: conflitos de schema, DB, API, preflight, Painel e Storefront foram
  resolvidos preservando Tickets 06 e 07. `pnpm lint`, `pnpm typecheck`,
  `pnpm test:quality`, `pnpm build`, `pnpm db:migrations:validate` e as provas
  cruzadas de carrinho/customizações + estados da Loja passaram localmente. Os
  quatro itens pendentes continuam desmarcados até evidência factual do CI
  Node 24 com migration/preflight/integração no Supabase real.

