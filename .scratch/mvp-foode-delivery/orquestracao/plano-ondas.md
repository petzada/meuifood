# Plano de ondas (2 subagentes) — Tickets 22→30

Fatia "C" = commit de contrato (Zod em `packages/shared/src/<domínio>/*`, `packages/db/src/schema/<domínio>.ts`, assinaturas RPC) e dona da migration do ticket.

| Onda | A | B |
|---|---|---|
| 0 | 21 | pesquisa (Better Auth/D1, MillionSend, AbacatePay, Efí, débito) |
| 1 | 22-C (migration auth) | 23-pré (shared money/menu, @foode/ui) |
| 2 | 22-API (lockfile) | 22-UI (admin entrar/definir-senha, seletor de Loja, navegação) |
| 3 | 23-C (migration menu, R2) | 29-C (Zod ops) |
| 4 | 23-API | 29-API (migration ops) |
| 5 | 23-UI | 29-UI |
| 6 | 24-C (migration pedido/horários/delivery) | 26-pré (adapter AbacatePay, dias úteis) |
| 7 | 24-API | 28-C+API (migration 28) |
| 8 | 24-UI | 24-impressão |
| 9 | 28-UI (lockfile QR) | 25-infra (rotas/domínios) |
| 10 | 25-legado (lockfile) | 13-C+API (migration 13) |
| 11 | 25-docs+smoke | 13-UI |
| 12 | 26-C+API (migration 26) | 27-pré+C |
| 13 | 26-UI | 27-API |
| 14 | 27-UI (lockfile Efí) | 12-C+API (migration 12) |
| 15 | 12-UI | 14-C |
| 16 | 15-API (migration 15, cron) | 14-API |
| 17 | 14-migration+lotes | 30-ops (rascunho runbook) |
| 18 | 14-UI | 20-C |
| 19 | 20-web | 20-admin |
| 20 | 30-E2E (lockfile) | 30-ops final |

Regras: numeração de migrations reservada pelo orquestrador (22→N+1, 23→N+2, 29→N+3, 24→N+4, 28→N+5, 13→N+6, 26→N+7, 27→N+8, 12→N+9, 15→N+10, 14→N+11; N = última do 21); um dono por onda de lockfile, wrangler.jsonc, CI; schema partido por domínio; subpath exports; navegação do admin é do 22-UI; caminho de escrita do Pedido: 24→13→26→27→12; 25-legado só após 24/28/29 na master.
