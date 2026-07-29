# 09 — Adicionar Delivery por Taxa fixa ou bairro

**What to build:** O Dono configura exatamente um modo de taxa de Delivery e o Consumidor conclui Delivery com endereço e valor calculados no servidor, podendo escolher Retirada quando disponível.

**Blocked by:** 08 — Concluir o primeiro Pedido Guest na Retirada.

**Status:** done

- [x] Dono escolhe Taxa fixa ou taxa por bairro, nunca os dois modos ativos simultaneamente.
- [x] No modo por bairro, Dono mantém bairros e preços em centavos sem duplicatas ambíguas.
- [x] No modo Taxa fixa, um único valor válido é aplicado e dados inativos do modo anterior não afetam o Pedido.
- [x] Dono ativa ou desativa Retirada independentemente do modo de Delivery.
- [x] Delivery exige endereço e valida bairro atendido quando aplicável.
- [x] A API calcula a taxa e o total; valores enviados pelo navegador não são fonte de verdade.
- [x] Bairro não atendido bloqueia Delivery e não impede Retirada quando ativa.
- [x] Operador não altera configurações e não entram km, raio ou geocoding.

## Comments

- 2026-07-29 — Decisões menores (gate Composer; sem ADR):
  1. **Normalização/unicidade de bairro:** nome de exibição preserva o input
     sanitizado; chave canônica = Unicode NFKD, remover marcas diacríticas,
     trim, colapsar espaços internos e `toLocaleLowerCase("pt-BR")`;
     UNIQUE `(store_id, normalized_name)` — `São  José`, `sao jose` e
     variações de caixa/espaço são duplicatas; mesma função no CRUD e no
     matching do checkout; teste explícito de acento/caixa/espaço.
  2. **Endereço Delivery/snapshot:** obrigatórios `streetLine` (logradouro +
     número em uma linha) e `neighborhood`; opcionais `complement` e
     `reference`; sem CEP, cidade separada, coordenadas ou geocoding no MVP;
     snapshot imutável no Pedido com os textos usados, modo de taxa e taxa em
     centavos; Retirada não exige nem persiste endereço Delivery.
  3. **Estado Delivery:** Ticket 09 inclui `fulfillment_type=delivery` e
     status `out_for_delivery` (label “Saiu para entrega”), Decisão 09/spec;
     fluxo Delivery após preparo: `out_for_delivery` → `completed`;
     cancelamentos nas transições canônicas; pedidos pickup preservam a
     máquina sem regressão.
- 2026-07-29 — Implementação na branch
  `cursor/delivery-taxa-fixa-bairro-391f`: migrations
  `20260729160000_ticket_09_delivery_enums` (ADD VALUE isolado) e
  `20260729161000_ticket_09_delivery_taxa_bairro` (config + snapshot + RLS);
  CRUD Dono-only; checkout Delivery/Retirada; recálculo server-side;
  preservação do gate TX/FOR UPDATE/advisory lock/token hash do Ticket 08;
  Seam 3 (normalização/taxa/status) e Seam 1 (`delivery-routes.test.ts` +
  regressão `order-routes.test.ts` no CI).
- Evidência local: `pnpm lint`, `pnpm typecheck`, `pnpm test:quality`,
  `pnpm build` e `db:migrations:validate` verdes. Provas HTTP/Postgres/RLS
  reais e migrate ficam a cargo do CI (Decisão 55) no Supabase de produção.
- 2026-07-29 — CI da PR #18 verde: run `30485647423` no commit `9d2f65f`
  (feat) e run final `30486153571` no HEAD `6ee478f` (docs): `quality`,
  `migrate` e `integration` passaram (`delivery-routes.test.ts` + regressão
  `order-routes.test.ts` no Supabase de produção). Checklist completo com
  evidência; `Status: needs-review` para aceite humano. Sem merge.
- 2026-07-29 — PR #18 mergeada em
  `5359e664c6de857dd25c3199b1a2fa9c38bb5493` após Composer 2.5 `PASS` no
  HEAD `78462de`; run final `30486470422` verde (`quality`, `migrate`,
  `integration`). Aceite humano registrado. A extensão da policy de migrations
  para `ALTER TYPE` aditivo entrou na fila de reverificação leve do Ticket 04.
