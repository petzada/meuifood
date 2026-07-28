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

- 2026-07-28 — Implementação local concluída nos commits `9d6308e`,
  `d683021` e `fc563a4`. Evidências executadas: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:quality`, `pnpm build`, validação de migrations e testes
  temporais/UI específicos. O preflight transacional e `pnpm test` completo
  foram tentados, mas as provas remotas não iniciaram porque este worktree
  isolado não possui as credenciais do Supabase de produção. Por isso os itens
  que dependem de persistência/RLS/RBAC reais permanecem desmarcados até a
  rodada final após o Ticket 06.

