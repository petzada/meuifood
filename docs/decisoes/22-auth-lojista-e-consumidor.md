# Decisão: auth lojista e consumidor

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling stack #5  
**Depende de:** [10](10-checkout-guest-e-conta.md), [21](21-banco-orm-multitenant.md)  
**Produto:** guest + conta ([10](10-checkout-guest-e-conta.md)); dono vs operador ([11](11-planos-por-faturamento-features-completas.md), [20](20-tenant-mvp-sem-workspaces.md))

## Decisão

### Lojista (`admin`)

| Item | Escolha |
| --- | --- |
| Provedor | **Supabase Auth** |
| Método | **E-mail + senha** |
| Equipe | **Convite de operador** (e-mail); operador entra com senha no mesmo Auth |
| Onboarding dono (MVP) | Founder **convida** via Supabase Auth → painel → UI de **plano** ([35](35-ui-billing-plano-painel.md)) |
| Autorização | JWT → `api` aplica **RBAC** (dono vs operador) + `store_id`; RLS reforça tenant |

### Consumidor (`web`)

| Item | Escolha |
| --- | --- |
| Guest | **Sem auth** — pedido com dados mínimos (nome, telefone, endereço se delivery) |
| Conta | **Supabase Auth — magic link por e-mail** |
| Pós-pedido guest → conta | Se criar conta depois, **vincular o(s) pedido(s)** guest à conta (mesmo fluxo já previsto em [10](10-checkout-guest-e-conta.md)); dados do pedido **permanecem gravados** e passam a constar no histórico do usuário |

## Implicações técnicas (MVP)

- Dois “mundos” de identidade no Auth (lojista vs consumidor) — separar por metadata/role ou tabelas de perfil (`store_members` vs `customers`), sem misturar sessões no UX.
- Guest: linhas de pedido com `customer_user_id` nulo; ao criar conta, backfill / link por e-mail+pedido (regra anti-abuso simples na implementação).
- `api` valida JWT Supabase; contexto RLS alinhado ao `store_id` / usuário conforme [21](21-banco-orm-multitenant.md).

## Rejeitado neste ciclo

- Auth 100% custom (JWT próprio) no lugar do Supabase Auth.
- Magic link como único método do painel lojista (senha é o padrão do MVP).
- OTP SMS como dependência do MVP (custo/complexidade).
- Exigir conta para o primeiro pedido.
