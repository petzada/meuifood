# 06 — Configurar Complementos e montar o carrinho

**What to build:** O Dono configura Complementos e Adicionais dos itens, e o Consumidor personaliza escolhas, quantidades e revisa um carrinho pertencente a uma única Loja.

**Blocked by:** 05 — Gerenciar e publicar o Cardápio da Loja.

**Status:** needs-review

- [x] Dono configura grupos de Complementos obrigatórios ou opcionais com opções ordenadas.
- [x] Dono configura Adicionais com preços em centavos e disponibilidade.
- [ ] Regras inválidas são rejeitadas sem persistência parcial e Operador não acessa a configuração.
- [x] O Consumidor não adiciona item enquanto faltar Complemento obrigatório.
- [x] Quantidades e Adicionais atualizam a prévia do carrinho deterministicamente.
- [x] O carrinho não mistura itens de Slugs ou Lojas diferentes.
- [x] Valores do navegador são apenas prévia; o contrato referencia itens e escolhas para recálculo posterior no servidor.
- [x] Alterações posteriores não reescrevem snapshots de Pedidos já concluídos.

## Comments

- 2026-07-28 — Implementação na branch
  `cursor/complementos-adicionais-carrinho-391f`: migration
  `20260728223000_ticket06_complementos_adicionais`, RLS/FKs compostas,
  configuração Dono-only, projeção pública e carrinho de prévia single-Loja com
  referências canônicas. Pedido/checkout não foram antecipados.
- Evidência local: `pnpm lint`, `pnpm typecheck`, `pnpm test:quality`,
  `pnpm build` e `migrations:validate` verdes; helper do carrinho com 6 testes e
  Storefront com teste de projeção/customização.
- A checkbox de atomicidade/RBAC permanece aberta até o workflow aplicar a
  migration pelo fluxo da Decisão 55 e executar
  `menu-customization-routes.test.ts` contra Postgres/RLS real. A tentativa local
  parou antes do teste por ausência das credenciais do Supabase de produção.
- Revisões persistidas em `verification/reports/06-standards.md` e
  `verification/reports/06-spec.md`; achados procedentes foram corrigidos antes
  deste estado `needs-review`.

