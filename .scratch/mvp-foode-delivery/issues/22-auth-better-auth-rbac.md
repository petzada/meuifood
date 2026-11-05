# 22 — Auth multi-Loja com Better Auth, RBAC e e-mail

**What to build:** Ops, Dono e Operador entram no Painel com Better Auth (D1); um usuário pode pertencer a várias Lojas e alterna a Loja ativa; convites e senhas chegam pela MillionSend; a API deriva papel e Loja da membership e aplica RBAC.

**Blocked by:** 21 — Fundar a stack Cloudflare.

**Status:** ready-for-agent

**Agente:** Opus (geral); telas de login/definir senha/seletor de Loja podem ir a um subagente Fable após o contrato.

- [ ] Better Auth na `api` com tabelas no D1; e-mail e senha; sem cadastro aberto (só convite ou seed `foode_ops`).
- [ ] O `admin` repassa `/api/auth/*` pelo service binding; cookie no domínio do Painel (`httpOnly`, `Secure`, `SameSite=Lax`).
- [ ] Convite, definição de senha e reset pela MillionSend (SDK `resend` com base URL MillionSend, `MILLIONSEND_API_KEY`); links expiram e são de uso único; remetente `nao-responda@foodedelivery.com.br` (até o DNS ficar ativo, usar o remetente verificado disponível e registrar).
- [ ] Memberships multi-Loja; seletor de Loja no Painel; a Loja ativa é validada no servidor a cada request; `store_id` nunca vem de header/query/body sem validação contra a membership.
- [ ] Module único de política (`foode_ops`, `owner`, `operator`) em middleware Hono (achado 19.5); um único fluxo de convite/provisionamento (19.6).
- [ ] Operador: só Pedidos/status; Ops: só `/ops`; Dono: sua Loja.
- [ ] Remover membership invalida o acesso nas requests seguintes.
- [ ] Rate limit e Turnstile (widget criado por API) em login, convite e reset.
- [ ] Testes: negação sem efeito persistido para cada papel, tentativa cross-Loja, usuário com duas Lojas.
- [ ] `@supabase/*` e o verificador JWKS removidos.

## Comments

- 2026-11-04 — Porta o Ticket 03; multi-Loja e `foode_ops` por [62](../../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md).
- 2026-11-04 — Fatia API (branch `feat/22-api-391f`): Better Auth no `PainelApi.fetch` (`/api/auth/*`, exige `cf-connecting-ip`), guard real (`authorize`/`requireRole`/`requirePermission` sobre `can()`), RPCs de sessão/Loja ativa/membros/convite/remoção com auditoria, provisionamento único em `@foode/db` (`store.inviteMember`, `ops.inviteOwner`), rate limit no D1 (Better Auth + `db.rateLimit` no convite), Turnstile (plugin `captcha` em sign-in, request-password-reset e reset-password; verificador próprio no convite), MillionSend por `fetch`. Links: `/definir-senha?token=…&fluxo=convite|reset` (convite 72 h, reset 1 h, mesmo `POST /api/auth/reset-password`, que cria a conta `credential`). Hash: scrypt padrão do Better Auth (~100 ms CPU, nativo no workerd). Pendências da UI: tela `/definir-senha` com Turnstile, `x-captcha-response` no login/reset, `cf-connecting-ip` no repasse, remoção de `@supabase/*` no admin.
- 2026-11-05 — Referência Anota (lojista): aplicar [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) AUTH-01 a AUTH-04, NAV-03 (Operador sem sidebar), NAV-04/NAV-08 (selo de status da Loja no shell e no seletor) e EQP-01; mapa em [MAPA-UX-LOJISTA](../../../docs/referencias/anota-ai/MAPA-UX-LOJISTA.md) §0 e §2. O login e-mail-primeiro e o "Criar minha conta" do Anota não se adotam (decisões 22 e 61).
