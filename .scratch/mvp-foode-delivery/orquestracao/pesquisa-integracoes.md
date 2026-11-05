# Pesquisa de integrações (Tickets 22, 25, 26, 27 e fundação 21)

**Data:** 2026-11-04 · **Escopo:** notas técnicas verificadas nas docs oficiais vigentes, para os agentes que
implementam os próximos tickets. Stack: Workers + Hono + D1 + Drizzle; `web`/`admin` Next.js 16 via OpenNext.
**Regra:** quando a doc não confirma algo, está marcado **[não confirmado]**: valide antes de depender disso.
Nenhum segredo aqui; chaves vão em `wrangler secret`.

---

## 1. Better Auth em Workers + D1 (Drizzle) — Ticket 22

**Fontes**
- Hono: https://www.better-auth.com/docs/integrations/hono
- Drizzle adapter: https://www.better-auth.com/docs/adapters/drizzle
- Opções: https://www.better-auth.com/docs/reference/options
- Cookies: https://www.better-auth.com/docs/concepts/cookies
- E-mail/senha: https://www.better-auth.com/docs/authentication/email-password
- Rate limit: https://www.better-auth.com/docs/concepts/rate-limit
- Captcha (Turnstile): https://www.better-auth.com/docs/plugins/captcha
- Organization: https://www.better-auth.com/docs/plugins/organization
- Admin: https://www.better-auth.com/docs/plugins/admin

**Setup**
- `wrangler.jsonc`: `"compatibility_flags": ["nodejs_compat"]` (Better Auth usa `AsyncLocalStorage`).
- Montagem no Hono: `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`, antes de qualquer catch-all;
  `basePath` padrão `/api/auth`.
- Banco: `drizzleAdapter(db, { provider: "sqlite", schema })` (pacote `@better-auth/drizzle-adapter`).
  A doc **não tem adapter D1 nativo**; D1 entra pelo Drizzle (`drizzle(env.DB)`).
- Instância **por request** (factory `createAuth(env)`): o binding D1 e os secrets só existem no `env`
  do request. Cachear por isolate só se o `env` for o mesmo; nunca criar cliente de banco no escopo do módulo.
- Schema: `npx auth@latest generate` (nome do CLI na doc atual) gera o schema Drizzle → `drizzle-kit generate`
  gera o SQL → aplicar com `wrangler d1 migrations apply <db> --remote` (o pipeline do 21). Não usar
  `drizzle-kit migrate` contra D1 remoto.
- Tabelas core: `user`, `session`, `account` (senha fica em `account`, `providerId = "credential"`),
  `verification`; + `rateLimit` se `rateLimit.storage = "database"`.
- Opções relevantes (nomes exatos): `secret` (`BETTER_AUTH_SECRET`), `baseURL`, `trustedOrigins`,
  `emailAndPassword: { enabled, disableSignUp, minPasswordLength (8), resetPasswordTokenExpiresIn (3600 s),
  revokeSessionsOnPasswordReset (false), sendResetPassword }`, `session: { expiresIn (7 d), updateAge (1 d),
  cookieCache }`, `advanced: { useSecureCookies, crossSubDomainCookies: { enabled, domain }, cookiePrefix,
  defaultCookieAttributes, ipAddress: { ipAddressHeaders }, database.generateId }`, `databaseHooks`, `hooks`.
- Sessão em middleware Hono: `auth.api.getSession({ headers: c.req.raw.headers })` → `c.set("session", …)`.

**Cookies entre `admin` (OpenNext) e `api` (service binding)**
- Desenho do ticket: o `admin` repassa `/api/auth/*` para a `api` via service binding. Assim o cookie é
  first-party no host do Painel e **não precisa** de `crossSubDomainCookies` nem CORS.
- `baseURL` da `api` deve ser a URL pública do Painel (ex.: `https://painel.<domínio>`), senão os links de
  reset e a validação de origem usam o host errado. `trustedOrigins` = origem do Painel.
- Nome do cookie: `${cookiePrefix}.session_token` (prefixo padrão `better-auth`); com Secure ganha
  `__Secure-`. Atributos pedidos (`httpOnly`, `Secure`, `SameSite=Lax`) via `defaultCookieAttributes`.
- Server actions / RSC no `admin` que leem sessão: repassar o header `cookie` na chamada ao binding
  (`env.API.fetch(new Request(url, { headers }))`). O plugin `nextCookies` existe na doc de Next, mas só
  serve se o Better Auth rodar dentro do Next — aqui ele roda na `api`.

**Multi-Loja: plugin `organization` x membership própria**
- Plugin cria `organization`, `member`, `invitation` e `session.activeOrganizationId`; papéis padrão
  `owner`/`admin`/`member`; `createAccessControl` permite papéis próprios; `invitationExpiresIn` (padrão 2 d);
  `sendInvitationEmail`; `setActiveOrganization`.
- **Aceitar convite exige usuário já logado com o mesmo e-mail** — não cobre "convidado sem conta define
  senha". `foode_ops` é global (não pertence a uma Loja), o que não cabe no modelo do plugin.
- **Recomendação:** membership própria (`store_membership(user_id, store_id, role)`) + política única no
  middleware Hono (achados 19.5/19.6); Loja ativa num campo de sessão (`session.additionalFields`) ou cookie
  próprio, **sempre revalidada contra a membership no servidor**.
- Provisionamento por convite sem cadastro aberto: `disableSignUp: true` bloqueia `/sign-up/email`. Criar o
  usuário no servidor (plugin `admin`: `auth.api.createUser({ body: { email, password, name, role } })` —
  **senha obrigatória**: gerar aleatória descartável) e mandar o link de "definir senha" pelo fluxo de reset
  (`auth.api.requestPasswordReset({ body: { email, redirectTo } })`). **[não confirmado]** se `createUser`
  funciona com `disableSignUp: true` — testar no primeiro commit; alternativa: `ctx.context.internalAdapter`.
- Remover acesso: apagar a membership e, se for a última, `auth.api.revokeUserSessions({ body: { userId } })`.

**Reset / definir senha**
- `POST /api/auth/request-password-reset` `{ email, redirectTo? }`; `POST /api/auth/reset-password`
  `{ newPassword, token }`. Callback: `sendResetPassword: async ({ user, url, token }, request) => …`.
- Não aguardar o envio (timing attack); em Workers usar `ctx.waitUntil(...)` (a doc indica `waitUntil`).
- Token de uso único, expira em `resetPasswordTokenExpiresIn` (3600 s padrão; para convite, avaliar 72 h).
- Hash: scrypt por padrão; `emailAndPassword.password: { hash, verify }` permite trocar.

**Rate limit e Turnstile**
- `rateLimit` vem ligado só em produção (`enabled: true` para testar), janela 10 s / máx. 100;
  `customRules` por caminho (ex.: `"/sign-in/email": { window: 60, max: 5 }`).
- **Storage padrão é memória → inútil em Workers** (isolates múltiplos). Usar `storage: "database"` (tabela
  `rateLimit` no D1) ou `customStorage.consume(key, rule)` (precisa ser atômico).
- IP: `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`. Padrão é `x-forwarded-for` (spoofável).
- Turnstile: plugin `captcha({ provider: "cloudflare-turnstile", secretKey })`; o cliente manda o token no
  header `x-captcha-response`. Endpoints padrão: `/sign-up/email`, `/sign-in/email`,
  `/request-password-reset` (definir `endpoints` substitui a lista: incluir o de convite/definir senha).
- Widget criado por API: `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/challenges/widgets`
  `{ name, domains: [...], mode: "managed" }`, token com `Turnstile Sites Write`
  (https://developers.cloudflare.com/turnstile/get-started/widget-management/api/). A site key vai ao front;
  o secret vai a `wrangler secret`.

**Armadilhas**
- **D1 não tem transação interativa.** A doc diz que `revokeSessionsOnPasswordReset` só é atômico com
  `transaction: true` no adapter, e que D1 não suporta: sessões podem ser revogadas e a troca de senha falhar
  (usuário pede novo link). Não ligar `transaction: true` com D1.
- **CPU do scrypt:** relatos de `Error 1102` (CPU excedida) no plano Free (10 ms). No Workers Paid o limite é
  configurável (`limits.cpu_ms`); medir login no CI/preview e fixar `cpu_ms` se preciso. Trocar o hash depois
  exige rehash no login.
- `cf-connecting-ip` só é confiável porque a `api` não deve ser pública para `/api/auth/*`: ou ela só aceita
  auth via binding, ou o `admin` sobrescreve o header. Se a `api` também for pública, um cliente pode forjar.
- `BETTER_AUTH_SECRET` ausente cai num segredo padrão e **lança erro em produção**: setar em todos os ambientes.
- Gerar o schema antes de escrever a migration à mão; colunas extras (Loja ativa) via `additionalFields`
  para o CLI incluí-las.

---

## 2. MillionSend (e-mail transacional e domínios) — Tickets 22 e 25

**Fontes** (doc pública)
- Índice: https://docs.millionsend.com/llms.txt · tudo: https://docs.millionsend.com/llms-full.txt
- OpenAPI 3.1: https://docs.millionsend.com/openapi.json
- Migração do Resend: https://docs.millionsend.com/migrate-from-resend

**Básico**
- Base URL: `https://api.millionsend.com`. Auth: `Authorization: Bearer ms_...`.
- **Wire-compatível com Resend**: SDK `resend` com base URL MillionSend funciona (o próprio produto diz
  "migrate with two env vars"); em Workers, `fetch` puro também serve e evita dependência.
- Limites de API: 600 req/min por chave, 3.000/min por time; 20 falhas de auth por IP.
- Planos Cloud: Free 100 e-mails/dia (UTC), Starter 1.500/dia; acima disso fila até 00:00 UTC.

**Enviar** — `POST /emails` (lote: `POST /emails/batch`, 1–100)
- Obrigatórios: `from` (`"Nome <nao-responda@dominio>"`, domínio **verificado** no time), `to` (até 50),
  `subject`, e `html` ou `text`. Opcionais: `cc`, `bcc`, `reply_to`, `scheduled_at`, `tags`, `headers`,
  `attachments` (base64).
- **`template` não é suportado: qualquer valor → 422.** Renderizar HTML na `api`.
- Idempotência: header `Idempotency-Key` (mesma chave + mesmo payload devolve a resposta original; payload
  diferente → 409). Usar o id do convite/reset como chave.

**Domínios**
- `POST /domains` `{ name, region?, custom_return_path?, open_tracking?, click_tracking?, tracking_subdomain? }`
  → `records[]` com `record` (DKIM, SPF = MAIL FROM MX+TXT, DMARC, Tracking, Receiving), `name`, `type`,
  `value`, `ttl`, `priority`, `status` (`not_started|pending|verified|failed`).
- `region`: `us-east-1` (padrão) | `eu-west-1` | `sa-east-1` | `ap-northeast-1`; **fixa na criação**.
- `GET /domains/{id}` (status por registro, `live`: found/missing/mismatch), `POST /domains/{id}/verify`,
  `PATCH`, `DELETE`. Limite: 10 domínios/hora por time (429 com `retry-after`); 403 se o plano estourar.
- Só DKIM e SPF bloqueiam envio; DMARC é recomendado.

**Armadilhas**
- No Cloudflare DNS, registros de e-mail (e o CNAME de tracking) ficam **DNS only** (nuvem cinza); proxied
  quebra a verificação.
- Domínio novo tem "new domain limit"/warm-up: envios podem ficar enfileirados (`queued` com motivo) nos
  primeiros dias. Convite que "não chegou" pode estar em fila — consultar `GET /emails/{id}`.
- Escolher `sa-east-1` ou `us-east-1` antes de criar; trocar região = recriar domínio e DNS.
- SDK Rust 0.4 documenta o mesmo 422 de `template`; não depender de templates do Resend.

---

## 3. AbacatePay (PIX e cartão "Rápido") — Tickets 26 e 27

**Fontes**
- Índice: https://docs.abacatepay.com/llms.txt (páginas em `.md`)
- Autenticação/permissões: https://docs.abacatepay.com/pages/authentication
- PIX: https://docs.abacatepay.com/pages/transparents/create · status:
  https://docs.abacatepay.com/pages/transparents/check · simular:
  https://docs.abacatepay.com/pages/transparents/simulate-payment
- Cartão: https://docs.abacatepay.com/pages/transparents/card · script:
  https://docs.abacatepay.com/pages/transparents/abacatepay-js · guia:
  https://docs.abacatepay.com/pages/guides/cartao-transparente
- Estorno: https://docs.abacatepay.com/pages/transparents/refund
- Webhooks: https://docs.abacatepay.com/pages/webhooks · segurança:
  https://docs.abacatepay.com/pages/webhooks/security · eventos:
  https://docs.abacatepay.com/pages/webhooks/events/transparent · criar:
  https://docs.abacatepay.com/pages/webhooks/create
- Dev mode: https://docs.abacatepay.com/pages/devmode

**Básico**
- Base URL única **`https://api.abacatepay.com/v2`** para dev e produção: **o ambiente é a chave** (chave de
  Dev mode simula; a de produção cobra). Respostas trazem `devMode`.
- Auth: `Authorization: Bearer <api-key>`. Envelope `{ data, error, success }`. Valores em **centavos**.
- Permissões por chave, **imutáveis após criar** (mudar = nova chave): `TRANSPARENT:CREATE`,
  `TRANSPARENT:READ`, `REFUND:CREATE`, `WEBHOOK:CREATE`, `WEBHOOK:READ`. 403 `Insufficient permissions`.
- Tudo é `fetch` + JSON: roda em Workers sem SDK.

**PIX** — `POST /transparents/create`
- `{ "method": "PIX", "data": { amount, description?, expiresIn? (s), customer?, metadata? } }`;
  mínimo `amount = 100`. **`customer` é opcional** → PIX não exige CPF/e-mail (só se usar
  `ensureSameTaxId`). `metadata` com `pedidoId`/`intentId` para conciliação.
- Resposta: `id` (`pix_char_...`), `status: PENDING`, `brCode` (copia-e-cola), `brCodeBase64` (PNG data URL),
  `platformFee` (custo do provedor, centavos), `expiresAt`.
- Status: `GET /transparents/check?id=pix_char_...` → `PENDING|PAID|EXPIRED|CANCELLED|REFUNDED|...`.
- Dev: `POST /transparents/simulate-payment` marca o PIX como pago (dispara webhook simulado).

**Cartão (Rápido)** — mesmo endpoint, `method: "CARD"`
- Front: `<script src="https://abacatepay.com/abacatepay.js">` (sem pacote npm; no Next usar
  `<Script strategy="beforeInteractive">`), chave pública `pk_...` (teste e produção distintas),
  `AbacatePay.create`/`mount`/`tokenize` → `ctok_` (**60 s, uso único**). Formulário em **iframe** e 3DS em
  janela própria — o layout Foode envolve, mas não estiliza os campos internos livremente.
- Back: `{ "method": "CARD", "data": { amount, token, customer: { name, email, taxId, cellphone }, metadata? } }`
  — os **quatro campos de customer são obrigatórios** (inclui celular); `amount` **igual** ao usado no
  `AbacatePay.create`; `installmentCount` omitido = à vista. `metadata` só aceita strings.
- Resposta: `id` (`card_...`), `status` (`APPROVED|PENDING|PAID|FAILED|REFUNDED`), `brand`, `lastFour`,
  `cardToken` (não guardar: não há recorrência). Consulta: `GET /transparents/get?id=card_...`
  (`/check` é só PIX). Recusa volta como **erro 400** genérico ("Não foi possível processar…").
- `APPROVED` = pode liberar o Pedido; `PAID` = adquirente repassou (depois, sem ação).

**Webhooks**
- Criar por API: `POST /webhooks/create` `{ name, endpoint (HTTPS público), secret, events: [...] }`; o webhook
  herda o ambiente da chave. Eventos úteis: `transparent.completed` (PIX `PAID`, cartão `APPROVED`),
  `transparent.refunded`, `transparent.disputed`, `transparent.lost`.
- Autenticação em duas camadas: (1) `?webhookSecret=<secret>` na URL — **é isso que prova a origem**;
  (2) header `X-Webhook-Signature` = base64(HMAC-SHA256(corpo **raw**, chave pública fixa publicada na página
  de segurança)) — só integridade. Em Workers: `crypto.subtle` (HMAC) sobre `await c.req.text()` antes do
  parse, comparação em tempo constante.
- Envelope: `{ id: "log_...", event, apiVersion: 2, devMode, data: { transparent, customer, payerInformation } }`.
  **Deduplicar por `id`** (igual em todas as retentativas). `taxId` vem mascarado.
- Entrega: 2xx em até 30 s; até 7 tentativas em ~18 h (5 s, 5 min, 30 min, 2 h, 5 h, 10 h); `410` desativa o
  webhook; 3xx não é seguido; outros 4xx não têm retry.

**Estorno** — `POST /transparents/refund` `{ id, reason? }` (`pix_char_`/`card_`/`char_`)
- **Só total.** PIX precisa estar `COMPLETE`; cartão `APPROVED`/`COMPLETE`. Repetir → 400
  "Esta cobrança já foi reembolsada." (tratar como sucesso). Erros: `INSUFFICIENT_FUNDS`,
  `TRANSACTION_UNDER_DISPUTE`, `LOCK_NOT_ACQUIRED` (retry), etc. Dispara `transparent.refunded`.
- O valor sai do **saldo `available` da conta AbacatePay**: sem saldo, o estorno falha.

**Débito/carteiras:** o checkout transparente só tem PIX, BOLETO e CARD (crédito). Carteiras aparecem só no
checkout **hospedado** (rejeitado em [60]). Conclusão para o Ticket 27: **sem débito/carteira na AbacatePay**.

**Armadilhas**
- Não há `Idempotency-Key` documentado na criação: a idempotência é nossa (intenção persistida antes da
  chamada; `metadata.intentId`). **Timeout no cartão não é recusa**: consultar/esperar webhook antes de repetir.
- Repasse manual ao lojista (D+1) tira dinheiro da conta; estorno posterior pode bater em `INSUFFICIENT_FUNDS`.
  Ops precisa manter saldo mínimo ou o estorno vira tarefa manual (Ticket 12).
- Secret do webhook fica na URL: **nunca logar a URL completa** (Sentry/request logs do Workers).
- CSP do Storefront precisa liberar `https://abacatepay.com` (script, iframe e popup 3DS); erro
  `PROVIDER_LOAD` = script bloqueado.
- Teste de cartão: `4242 4242 4242 4242` aprova; `…0002` recusa, `…0069` expirado, `…0127` CVV.

---

## 4. Efí — API de Cobranças, cartão de crédito ("Normal") — Ticket 27

**Fontes**
- Cartão: https://dev.efipay.com.br/docs/api-cobrancas/cartao
- Credenciais/OAuth: https://dev.efipay.com.br/docs/api-cobrancas/credenciais
- Notificações: https://dev.efipay.com.br/docs/api-cobrancas/notificacoes
- Status: https://dev.efipay.com.br/docs/api-cobrancas/status
- Tokenização: https://github.com/efipay/js-payment-token-efi (npm `payment-token-efi`, v3.5.0)
- Certificado: README do SDK oficial https://github.com/efipay/sdk-php-apis-efi

**Ambientes e auth**
- Produção `https://cobrancas.api.efipay.com.br`; homologação `https://cobrancas-h.api.efipay.com.br`.
- `POST /v1/authorize` com **HTTP Basic** (`client_id:client_secret`) e corpo `{ "grant_type": "client_credentials" }`
  → `access_token`, `expires_in` (600 s). Chamadas seguintes: `Authorization: Bearer <access_token>`.
- **mTLS não é exigido na API Cobranças** (SDK oficial: "com exceção da API Cobranças, é obrigatório
  informar o certificado"). Só Pix/Open Finance exigem. ⇒ roda em Workers com `fetch` puro.

**Tokenização no front** (`payment-token-efi`, só navegador — não roda em Node/Workers)
```js
const { payment_token, card_mask } = await EfiPay.CreditCard
  .setAccount(PAYEE_CODE)            // "Identificador de conta" (API > Introdução); público
  .setEnvironment("production")      // ou "sandbox"
  .setCreditCardData({ brand, number, cvv, expirationMonth: "MM", expirationYear: "YYYY",
                       reuse: false /* , enable3ds: true, totalValue: centavos */ })
  .getPaymentToken();
```
- `brand`: `visa|mastercard|amex|elo|hipercard` (a lib identifica a bandeira; `isScriptBlocked()` detecta
  bloqueio do script de fingerprint antifraude). 3DS opcional (`enable3ds` → `tds_identifier`);
  **[não confirmado]** como enviar `tds_identifier` na cobrança — a página de cartão não cita.
- Geração de token no back foi **descontinuada** pela Efí.

**Cobrança one-step** — `POST /v1/charge/one-step`
```json
{ "items": [{ "name": "Pedido #123", "value": 5990, "amount": 1 }],
  "metadata": { "custom_id": "<intentId>", "notification_url": "https://api.<dominio>/webhooks/efi?secret=..." },
  "payment": { "credit_card": { "installments": 1, "payment_token": "<token>",
    "customer": { "name": "...", "cpf": "...", "email": "...", "phone_number": "...", "birth": "AAAA-MM-DD" },
    "billing_address": { "street": "...", "number": "...", "neighborhood": "...", "zipcode": "...", "city": "...", "state": "SP" } } } }
```
- Valores em centavos. A doc não marca obrigatórios; o exemplo usa `name`, `cpf`, `email`, `phone_number`
  (sem `birth`). **[não confirmado]** se `birth`/`billing_address` são exigidos em produção — testar.
- Resposta: `charge_id`, `status`, `total`; recusa → `status: "unpaid"` + `refusal: { reason, retry }`.
- Outros: `GET /v1/charge/:id`; `POST /v1/charge/:id/retry` (só `unpaid`); `PUT /v1/charge/:id/cancel`
  (só `new|waiting|unpaid|link`); `PUT /v1/charge/:id/metadata` (trocar `notification_url`).

**Status**: `new` → `waiting` → `approved` (emissor aprovou, ainda não creditado) → `paid`; `unpaid`
(recusado), `refunded`, `canceled`, `contested`, `settled`, `expired`. Finais: `paid`, `contested`,
`refunded`, `settled`, `canceled`.

**Notificação**
- POST na `notification_url` só com o **token** (`notification=<token>`, form-encoded segundo o exemplo PHP
  **[content-type não confirmado]**), sem assinatura. O estado vem de `GET /v1/notification/:token` (com
  Bearer): `data[]` cronológico com `id` sequencial, `custom_id`, `status.{current,previous}`,
  `identifiers.charge_id`, `value`, `received_by_bank_at`.
- Processar **todos** os itens ainda não vistos (`id`), não só o último. Efí só considera entregue quando
  o GET é feito; 2xx no POST; até 10 retentativas com backoff crescente; redirect 301/302 quebra a entrega.
- O `?secret=` da URL é nossa camada de autenticação (decisão [60]).

**Estorno** — `POST /v1/charge/card/:id/refund` `{ "amount": centavos? }` (sem `amount` = total)
- Só com status `paid`; parcial até 90 dias (1 por dia), total até 360 dias.

**Débito:** a API Cobranças só documenta cartão de **crédito** (bandeiras Visa, Master, Amex, Elo,
Hipercard); o plugin oficial WooCommerce lista boleto, crédito, Pix e Open Finance. Conclusão para o
Ticket 27: **sem débito online na Efí**.

**Armadilhas**
- `approved` ≠ `paid`: decidir qual marca o Pedido pago. Recomendação: aceitar o Pedido em `approved`
  (o emissor aprovou) mas lançar o Ledger como "a liberar" e só considerar confirmado em `paid`; registrar
  a escolha no Ticket 27.
- Token OAuth dura 600 s: cachear por isolate com margem, renovar em 401.
- Homologação e produção usam **credenciais diferentes** e `setEnvironment` diferente no front; o
  `payee_code` é da conta (público, pode ir ao front).
- CSP do Storefront: liberar o script de fingerprint da Efí (`isScriptBlocked()` para diagnosticar).

---

## 5. OpenNext + service bindings + testes em workerd — Ticket 21 em diante

**Fontes**
- OpenNext Cloudflare: https://opennext.js.org/cloudflare · bindings:
  https://opennext.js.org/cloudflare/bindings · troubleshooting: https://opennext.js.org/cloudflare/troubleshooting
- Service bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/ · migração:
  https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/ ·
  APIs: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/ · known issues:
  https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/
- D1 limites: https://developers.cloudflare.com/d1/platform/limits/

**OpenNext (`@opennextjs/cloudflare`)**
- Suporta todas as versões do **Next 16** (e últimas 15/14); App Router, Route Handlers, SSR/SSG/ISR,
  Middleware, `after`, `'use cache'`, Turbopack.
- **Não suporta Node Middleware** (Next ≥ 15.2). No Next 16 o `proxy.ts` roda em **Node por padrão** ⇒
  manter `middleware.ts` (edge, depreciado mas funcional) ou evitar lógica em proxy. **[não confirmado]**
  na doc do OpenNext para `proxy.ts` especificamente: testar no build do 21.
- Runtime Edge (`export const runtime = "edge"`) não é suportado: o adaptador mira o runtime Node.
- Tamanho: 3 MiB (Free) / 10 MiB (Paid), **gzip**. Analisar
  `.open-next/server-functions/default/handler.mjs.meta.json` se estourar.
- Config: `nodejs_compat` e `compatibility_date` ≥ 2025-05-05 (evita `FinalizationRegistry is not defined`).
- Bindings: `getCloudflareContext().env.X` em route handlers/server components; em SSG
  `await getCloudflareContext({ async: true })`. Tipos: `wrangler types --env-interface CloudflareEnv`.
- `initOpenNextCloudflareForDev()` no `next.config.ts` para bindings no `next dev`; `remote: true` no binding
  (Wrangler ≥ 4.36) usa recurso remoto — **não** usar com o D1 de produção.
- "Cannot perform I/O on behalf of a different request": cliente de banco/fetch criado no escopo do módulo.
  Criar por request.

**Service bindings (`admin`/`web` → `api`)**
- `services: [{ binding: "API", service: "foode-api" }]`; HTTP (`env.API.fetch(request)`) ou RPC
  (`WorkerEntrypoint`). Mesma thread, sem latência extra, **sem custo adicional**.
- Limite: **32 invocações de Worker por request** (cada chamada ao binding conta) e conta como subrequest.
- Sempre `await` (senão o callee é encerrado). **Deploy da `api` antes** do `admin`/`web`.
- A `api` pode ficar sem rota pública para auth; webhooks precisam de rota pública
  (`api.<domínio>/webhooks/*`).
- `ctx.access` (Cloudflare Access) não propaga pelo binding; headers só se o caller repassar o `Request`.
- Dev local: `wrangler dev -c admin.jsonc -c ../api/wrangler.jsonc` (experimental) ou um terminal por Worker.

**Testes em workerd**
- **`@cloudflare/vitest-pool-workers` foi substituído por `@cloudflare/vitest-plugin` (^1.0)**: mesma API e
  config; troca de dependência, imports (`cloudflareTest`), `types` e subpaths (`/config`). Codemod:
  `npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin`. Fixar a versão de Vitest exigida pelo
  pacote (o repo usa `vitest ^4.1`) — conferir peer deps no install.
- D1 nos testes: `readD1Migrations(dir)` de `@cloudflare/vitest-plugin/config` (roda em Node, no config) e
  injeta como binding (convenção `TEST_MIGRATIONS`); `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` de
  `cloudflare:test` num `setupFiles`. `env` vem de `cloudflare:workers`. Integração: `exports.default.fetch()`
  (substitui `SELF`). `reset()` limpa os bindings (bom em `afterEach`).
- Storage isolado **por arquivo de teste** (não por teste): limpar entre testes do mesmo arquivo.
- Coverage: só **Istanbul** (V8 não). `import()` dinâmico falha em handlers testados via `exports`.
- Mock de saída (AbacatePay/Efí/MillionSend): doc recomenda `@msw/cloudflare`; o desenho do 26/27 prefere
  adapter fake no limite HTTP — ambos servem.
- Dep CJS quebrando: `deps.optimizer.ssr.include`.

**Limites D1 que afetam o desenho**
- 100 parâmetros ligados por query (inserts em lote de itens de cardápio/Ledger: fatiar); 100 KB por
  statement; 1.000 queries por invocação (Paid; `batch()` conta 1); 30 s por query; 10 GB por banco;
  resultado ≤ 50 MB (a partir de 2026-11-04); Time Travel 30 dias (Paid).
- `batch()` é o mecanismo atômico (sem transação interativa).

---

## Passos humanos e decisões que esta pesquisa levanta

1. **AbacatePay:** criar no dashboard as chaves de produção (e Dev) com as permissões listadas — imutáveis;
   pegar a chave pública `pk_` de produção; registrar o webhook (por API com a chave, ou no dashboard).
2. **Efí:** criar a aplicação na conta Foode com escopo de emissão de cobranças/cartão, anotar o
   "Identificador de conta" (`payee_code`); credenciais de homologação e produção separadas.
3. **MillionSend:** criar conta/chave `ms_`, escolher região do domínio (`sa-east-1`?) e publicar DKIM/SPF
   em DNS only; contar com warm-up do domínio novo. Plano Free = 100 e-mails/dia.
4. **Workers Paid** é pré-requisito prático (CPU do scrypt, 10 MiB do OpenNext, 1.000 queries/invocação).
5. **Decidir no 27:** Pedido pago em `approved` ou só em `paid` (Efí); sem débito/carteira nos dois provedores.
6. **Ledger/estorno:** manter saldo na AbacatePay para estornos após repasse (estorno só total, debita saldo).
