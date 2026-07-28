# 03 — Autenticar Dono e Operador e aplicar RBAC

**What to build:** Dono e Operador entram no Painel por Supabase Auth, a API deriva membership, Loja e papel de forma confiável, e o Dono consegue convidar ou remover Operadores sem permitir que eles acessem capacidades além de Pedidos/status.

**Blocked by:** 02 — Instalar Loja, `store_id` e RLS efetiva.

**Status:** ready-for-agent

- [ ] Dono e Operador usam convite, e-mail e senha no Supabase Auth.
- [ ] A API valida JWT/JWKS e rejeita token ausente, inválido, expirado ou sem membership.
- [ ] `store_id` e papel são derivados da membership persistida, nunca de header, query ou body arbitrário.
- [ ] Dono pode listar membros, convidar Operador e remover seu acesso sem apagar o histórico operacional.
- [ ] Operador acessa somente Pedidos e mudanças de status; configurações, Cardápio, Plano, equipe, relatórios e informações financeiras são negados pela API.
- [ ] Remover um Operador invalida seu acesso nas requests seguintes, mesmo que a sessão já tenha sido emitida.
- [ ] Testes HTTP verificam respostas e ausência de efeito persistido para RBAC negado e tentativa cross-Loja.
- [ ] Esconder navegação no Painel é apenas UX e não substitui autorização no servidor.

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
