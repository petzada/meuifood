# 22 — Portar Auth e RBAC para Better Auth

**What to build:** Dono e Operador entram no Painel com Better Auth (D1), o convite chega pela MillionSend, a API deriva Loja e papel da membership persistida e o RBAC do Ticket 03 continua valendo sem Supabase Auth.

**Blocked by:** 21 — Fundar a stack Cloudflare: Workers, D1 e CI/CD.

**Status:** ready-for-agent

- [ ] Better Auth roda na `api` com tabelas no D1; e-mail e senha para Dono e Operador; sem cadastro aberto.
- [ ] O `admin` repassa `/api/auth/*` pelo service binding; cookie de sessão no domínio do Painel (`httpOnly`, `Secure`, `SameSite=Lax`).
- [ ] Convite de Operador, definição de senha e reset enviados pela MillionSend (SDK `resend` com base URL própria); links expiram e são de uso único.
- [ ] `store_id` e papel vêm da membership persistida, nunca de header, query ou body.
- [ ] RBAC em middleware Hono com um module único de política Dono/Operador (achado 19.5); o privilégio do Operador não é expresso por omissão de argumento.
- [ ] Um único `provisionOwner`/convite (achado 19.6).
- [ ] Remover um Operador invalida o acesso nas requests seguintes, mesmo com sessão emitida.
- [ ] Login e convite têm rate limit e Turnstile.
- [ ] Testes HTTP provam negação ao Operador sem efeito persistido e tentativa cross-Loja, contra D1 efêmero.
- [ ] Dependências `@supabase/*` e o verificador JWKS saem do `admin` e da `api`.

## Comments

- 2026-11-04 — Aberto no pivô ([59](../../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)). Porta o comportamento do Ticket 03.
