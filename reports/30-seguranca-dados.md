# Ticket 30 — Revisão de segurança dos dados pessoais

**Data:** 2026-11-05 · **Base:** `master` em `8e0bc7f` (Tickets 12, 13, 15, 24a, 26, 27, 28) + leitura de `origin/feat/14-plano-relatorios-391f` (Ticket 14, ainda fora da `master`) · **Branch:** `feat/30b-api-391f`

Escopo: os itens da seção "Revisão de segurança dos dados pessoais" do [Ticket 30](../.scratch/mvp-foode-delivery/issues/30-prontidao-testes-producao.md), as decisões [63](../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (P-2.1, P-REL-3, P-REL-4), [65](../docs/decisoes/65-login-consumidor-codigo-whatsapp.md) e [68](../docs/decisoes/68-busca-telefone-com-conta.md), o token do Pedido na URL e nos logs, os webhooks e os dados de cartão. Este relatório não contém nenhum dado real. Os números de teste são fictícios.

## Resumo

| # | Item | Resultado |
| --- | --- | --- |
| 1 | Busca por telefone: só a mesma Loja | ok |
| 2 | Busca por telefone: resposta mascarada até "Sou eu" | ok |
| 3 | Busca por telefone: rate limit por IP + Turnstile | **corrigido** (teto global por IP entre Lojas) |
| 4 | Busca por telefone: auditoria sem telefone em claro | ok (observação A1) |
| 5 | Busca por telefone: teste de enumeração bloqueado | **corrigido** (teste novo entre Lojas) |
| 6 | Login: código só em hash, uso único | ok |
| 7 | Login: 5 tentativas, 5 min, reenvio 30 s | ok |
| 8 | Login: rate limit por telefone e IP | **corrigido** (teto de 8 códigos/telefone/24 h) |
| 9 | Login: mensagens não revelam conta | ok (risco residual R1, R2) |
| 10 | CPF/telefone fora de logs e Sentry | **corrigido** (Sentry da api e do web) |
| 11 | TOP 10 clientes (Ticket 14, leitura) | ok no código; **achado de UI** para o 14 (K1) |
| 12 | Funil sem dado pessoal | ok |
| 13 | Pixel sem dado pessoal | **corrigido** (token do Pedido ia para Meta/Google) |
| 14 | CSV de relatórios (Ticket 14, leitura) | ok |
| 15 | Token do Pedido na URL/logs | **corrigido** (Sentry, breadcrumbs, Pixel, widget) |
| 16 | Webhooks (segredo, corpo) | ok + **corrigido** (token da notificação Efí nos breadcrumbs) |
| 17 | Dados de cartão nunca na api | ok |
| 18 | Varredura de logs/Sentry de produção pós-smoke | **pendente** (runbook) |
| 19 | Sentry do Painel (`apps/admin`) | **pendente** (K3, encaminhado) |

## 1. Busca por telefone no checkout (P-2.1, decisão 68)

**Evidência**

- `apps/api/src/storefront-service.ts:517` (`lookup`): ordem dos controles = registro em `phone_lookups` com rate limit por IP na mesma escrita, depois rate limit por telefone, depois Turnstile (`:543`). Telefone com conta Foode (`:549`) devolve só `{ found: false, hasAccount: true }`, nem mascarado. Sem conta, devolve `firstName` + rua sem número + bairro (`:567`) e um token de uso único.
- `packages/db/src/storefront-order-db.ts` (`phoneLookupMatch`/`phoneLookupConfirm`): o Pedido é procurado por `store_id = phone_lookups.store_id`. O "Sou eu" consome o token num `UPDATE … confirmed_at IS NULL … store_id = <Loja ativa do Slug>`: uso único, vence em 5 min e não vale em outra Loja.
- `phone_lookups` guarda Loja, horário, hash do IP truncado (/24 IPv4, /48 IPv6, com sal), resultado e o Pedido encontrado. **Nenhuma coluna de telefone**, conferido em `packages/db/src/schema/orders-schema.test.ts:101`. O rate limit por telefone usa `phoneRateKey` (HMAC com sal, `apps/api/src/order-crypto.ts:94`).
- O Turnstile falha fechado: sem secret, com token vazio, rede fora ou timeout, recusa (`apps/api/src/auth/turnstile.ts`). O `TURNSTILE_SECRET_KEY` é obrigatório no deploy da api.
- Testes: `apps/api/src/storefront.d1.test.ts:412` (Turnstile, máscara, "Sou eu" de uso único, só a mesma Loja), `:458` (5 por IP por Loja, mesma /24 = mesmo IP, 5 por telefone), `packages/db/src/storefront-order.d1.test.ts` (isolamento entre Lojas, token vencido) e `apps/api/src/conta-cupons.d1.test.ts` ("busca por telefone com conta só sinaliza 'Entrar com WhatsApp'").

**Achado S1 (corrigido): enumeração trocando de Loja.** O rate limit por IP era **por Loja** (5 em 10 min) e o por telefone era por Loja + telefone. Uma varredura do mesmo IP ganhava +5 consultas a cada Loja nova. A resposta `hasAccount` da decisão 68 é **global**: diz se o telefone tem conta Foode em qualquer Loja. Com N Lojas ativas, um IP descobria 5·N telefones com conta a cada 10 min.

**Correção:** um teto global por IP de **8 consultas em 10 min somando todas as Lojas** (`PHONE_LOOKUP_GLOBAL_IP_MAX`, `packages/shared/src/order/storefront.ts`). É decidido na mesma escrita atômica da auditoria (`phoneLookupBegin`, segundo `CASE` sobre `phone_lookups_ip_idx`), sem tabela nova e sem migration. As consultas barradas também contam.

**Testes novos:** `apps/api/src/storefront.d1.test.ts:483` ("vários telefones seguidos do mesmo IP, trocando de Loja, são barrados no teto global": 5 na Loja A, a 6ª barrada, mais 2 na B e a seguinte barrada; outra /24 segue normal) e `packages/db/src/storefront-order.d1.test.ts` ("teto global por IP somando todas as Lojas").

**Observação A1 (sem correção):** a consulta de um telefone **com conta** fica auditada como `not_found`, porque o enum de `phone_lookups.result` não tem `has_account`. Nenhum dado foi exposto e o evento está registrado (Loja, horário, hash do IP). Mudar o enum exigiria migration (recriação de tabela no SQLite). Fica como melhoria futura, se o Dono quiser distinguir esse caso na auditoria.

## 2. Login do Consumidor por código (decisão 65)

**Evidência**

- Código aleatório uniforme (`randomLoginCode`, rejeição para não enviesar), guardado como `HMAC(chave derivada de BETTER_AUTH_SECRET, codeId|telefone|código)`. A chave do telefone também é HMAC (`apps/api/src/customer-service.ts`, `loginCodeKeys`). `customer_login_codes` não tem telefone nem código em claro (`CHECK` de hex em `packages/db/src/schema/customers.ts`).
- Uso único, 5 tentativas e 5 min ficam num único `UPDATE` condicional (`packages/db/src/customer-db.ts:157`, `attemptLoginCode`). O reenvio após 30 s fica no próprio `INSERT … WHERE NOT EXISTS` (`issueLoginCode`, `:96`).
- Rate limit por telefone **e** por IP, com chaves em hash, antes do Turnstile, no pedido e na verificação (`customer-service.ts:197` e `:250`). O cadastro também tem limite (`:314`).
- A resposta do pedido de código é idêntica com ou sem conta. Só depois do código certo o próprio dono do telefone sabe se precisa se cadastrar.
- A sessão usa cookie `__Host-`, `HttpOnly`, `Secure` e `SameSite=Lax`. O banco guarda só o SHA-256 do token.
- Testes: `apps/api/src/conta-cupons.d1.test.ts:290` (mensagem exata, uso único, resposta igual com ou sem conta), `:314` (reenvio em 30 s), `:333` (5 min), `:343` (5 tentativas), `:359` (concorrência), `:399` (Turnstile, rate limit, falha de envio).

**Achado S2 (corrigido): força bruta do código de 4 dígitos.** As janelas de rate limit são de 300 s (a `rate_limits` é limpa pelo Better Auth depois disso). Contra um único telefone, elas ainda permitiam ~10 palpites a cada 5 min, ou seja, **≈ 2 880 palpites/dia contra 10 000 códigos possíveis** (≈ 25% de chance por dia, se o atacante passar no Turnstile).

**Correção:** um teto de **8 códigos por telefone em 24 h** (`LOGIN_CODE_DAILY_MAX_PER_PHONE`, `packages/shared/src/customer/login.ts`), contado na própria `customer_login_codes` (índice `phone_key, created_at` já existente) dentro do mesmo `INSERT` condicional. Os envios que falham são apagados e não contam. No máximo 40 palpites por dia por telefone (≈ 0,4%). A resposta é `rate_limited`, igual a qualquer limite, sem revelar nada. Sem migration.

**Teste novo:** `apps/api/src/conta-cupons.d1.test.ts:367` (8 códigos no dia: o 9º recebe 429 e nada é enviado; depois de 24 h volta a valer).

**Risco residual R1 (aceito pela 65):** o conflito de CPF no cadastro (`account_conflict`, `customer-service.ts:329`) revela, a quem já verificou o **próprio** telefone, que aquele CPF tem conta Foode. É inerente à regra "um CPF = uma conta". O cadastro tem limite de 5 em 5 min por IP e por telefone verificado, e a mensagem não mostra nenhum dado da outra conta (teste `conta-cupons.d1.test.ts`, "conflito sem dados da outra conta"). Um teto diário exigiria guardar tentativas de cadastro (migration). Fica registrado.

**Risco residual R2 (decisão 68):** a busca por telefone responde `hasAccount: true` para telefone com conta, o que mostra que existe conta Foode. É a UX decidida pelo Dono ("Entrar com WhatsApp"). A exposição fica contida pelo Turnstile, pelo limite por telefone e pelo teto global por IP da correção S1.

## 3. CPF, telefone e segredos fora de logs e Sentry

**Evidência:** varredura de `console.*` e `Sentry.capture*` em `apps/api/src` e `apps/web/src`. Os logs da api são JSON com campos fixos (`message`, `provider`, `code`, `status`, `counts`). O `customer-service.ts` e o `storefront-service.ts` não têm log com dado pessoal. A whatsmiau descarta o corpo da resposta sem ler (ele pode ecoar o número). O `onError` loga só `message` + caminho redigido.

**Achado S3 (corrigido): Sentry da api.** O `beforeSend` tirava corpo, query e cookies, mas **mantinha os headers** da request (`cookie` da sessão do Consumidor e `cf-connecting-ip`) e não tratava **breadcrumbs** de fetch de saída. Na Efí, `GET /v1/notification/:token` leva o token da notificação no caminho.

**Correção:** `scrubSentryEvent`/`scrubSentryBreadcrumb` (`apps/api/src/app.ts`, ligados em `apps/api/src/index.ts`). Tiram headers e usuário, e passam a URL dos breadcrumbs por `redactPath`, que agora também redige `/notification/:token`. Teste em `apps/api/src/order-crypto.test.ts` ("Sentry: evento sem corpo, query, cookies, headers e usuário; fetch sem token").

**Achado S4 (corrigido): Sentry do Storefront (`apps/web`).** Os três `Sentry.init` (cliente, servidor e edge) não tinham `beforeSend`. A URL `/loja/{slug}/pedido/{token}` ia inteira em `request.url`, na transação e nos breadcrumbs de navegação e de fetch (`/pedido/{token}/acompanhar`). O token dá acesso a nome, endereço e itens do Pedido.

**Correção:** `apps/web/src/lib/sentry-scrub.ts` (URL sem query, hash e token; sem corpo, cookies, headers e usuário; breadcrumbs de console sem mensagem), ligado em `instrumentation-client.ts`, `sentry.server.config.ts` e `sentry.edge.config.ts`. Teste em `apps/web/src/lib/sentry-scrub.test.ts`.

## 4. TOP 10 clientes (P-REL-3), por leitura do Ticket 14

Lido em `origin/feat/14-plano-relatorios-391f`, sem alterar nada:

- `packages/db/src/report-db.ts`: `report()` recusa quem não é `owner` (`FoodeDbError("forbidden")`). A consulta é sempre `o.store_id = ?` da Loja do contexto e só considera Pedidos com `customer_account_id` (Guest nunca aparece). Devolve só `name`, `orders` e `totalCents`, com `LIMIT 10`. Telefone, CPF e endereço não saem da consulta.
- `apps/api/src/finance-service.ts`: relatórios, CSV e Repasses passam por `asOwner` (`store.finance`, só o Dono). Operador e Ops recebem `forbidden`.
- **Achado K1 (para o Ticket 14, UI):** a decisão 64 prevê "CSV + impressão do navegador". Se a tela `/relatorios` imprimir a página inteira, o TOP 10 (nomes de Consumidores) sai no papel ou no PDF da impressão, e na prática isso é uma exportação. A P-REL-3 diz "sem exportação". Sugestão: esconder a seção do TOP 10 na impressão (`print:hidden`) e cobrir com teste.

## 5. Funil e Pixel (P-REL-4)

**Funil, ok:** o corpo é só `{ event }` com `.strict()` (`packages/shared/src/onboarding/funnel.ts:34`) e o contador é agregado por Loja e dia (`store_funnel_daily`: `store_id`, `day`, `event`, `count`). O IP só existe como hash truncado com sal na chave do rate limit, que expira. O cliente envia uma vez por sessão, sem cookie, telefone ou id (`apps/web/.../storefront/funnel.ts`).

**Pixel, conteúdo ok:** os payloads levam só id e nome do item, valor, moeda e código do Pedido (teste `funnel.test.ts`, "sem dado pessoal em nenhum payload").

**Achado S5 (corrigido): o token do Pedido ia para a Meta e o Google.** O `purchase` dispara na página `/loja/{slug}/pedido/{token}`, que carregava o `fbevents.js` (com `PageView`) e o `gtag` com `config` padrão. As duas redes enviam `location.href` (`dl`/`page_location`), **com o token**. Além disso, na navegação do checkout para a página do Pedido (`router.push`, no navegador), a Meta e a medição aprimorada do GA registram a troca de rota com a URL nova.

**Correção:**

- Página do Pedido (`PixelScripts` com `safePagePath`): o `fbevents.js` **não carrega**. O `purchase` da Meta vai pela imagem `/tr` (forma "noscript" da Meta) com `dl` = `/loja/{slug}/pedido` (sem token) e `referrerPolicy="no-referrer"`. O Google recebe `page_location` sem token no `config` e no evento (`pixels.ts`, `pixel-scripts.tsx`, `order-tracking.tsx`).
- Em todas as páginas, a Meta não acompanha a troca de rota (`fbq.disablePushState=true`).
- Com Pixel carregado, o checkout vai para a página do Pedido por navegação completa (`window.location.assign`), para os scripts não verem o token. Sem Pixel, segue `router.push` (`checkout.tsx`).
- Testes: `apps/web/.../storefront/funnel.test.ts` ("página do Pedido: nem Meta nem Google recebem o token da URL"; "navegação completa só quando há script de Pixel carregado") e `apps/web/src/app/loja/[slug]/page.test.tsx` (`disablePushState`; sem `fbevents.js` e com `page_location` sem token na página do Pedido).
- **Verificação manual pendente:** no runbook, abrir a página de um Pedido de teste com o Pixel configurado e conferir na aba Rede que nenhuma chamada a `facebook.com`/`google-analytics.com`/`googletagmanager.com` leva `/pedido/<token>`. A tag do Google pode ter recursos (Ads/Conversion Linker) que leiam a URL por conta própria.

## 6. CSV de relatórios, por leitura do Ticket 14

`packages/shared/src/finance/csv.ts` em `origin/feat/14-plano-relatorios-391f`: só agregados (resumo, status, Fulfillment, meio, top itens × dia da semana, funil). **Sem TOP 10 e sem nenhuma coluna de telefone, CPF, endereço ou nome de cliente**, com a lista `CSV_FORBIDDEN_HEADERS` conferida nos testes do 14. Fórmulas (`= + - @ \t \r` no início) são neutralizadas com `'`. Nome de arquivo só ASCII. **Ok.**

## 7. Token do Pedido na URL e nos logs

- Token = `HMAC(ORDER_TOKEN_SECRET, id)` (`order-crypto.ts:49`). O banco guarda só o SHA-256. Token de outra Loja ou inválido recebe 404 sem distinguir (`storefront.d1.test.ts:376`). A página tem `noindex`, `robots.ts` bloqueia `/loja/*/pedido/` e a resposta é `no-store`.
- api: `redactPath` tira o token de `/pedidos/:token` (inclusive `/cartao` e `/pix`) e a query de todo log e evento do Sentry.
- web: corrigido no Sentry (S4), nos Pixels (S5) e no widget de suporte, que não monta nas páginas com token (§9).
- **Risco residual R3:** os Workers têm `observability.enabled` (Workers Logs). O log de invocação da Cloudflare registra a URL da request, com `/loja/{slug}/pedido/{token}` no `foode-web` e `/storefront/lojas/{slug}/pedidos/{token}` no `foode-api`. O acesso é restrito à conta Cloudflare da Foode e a retenção é limitada, mas o dado existe. Mitigações possíveis, fora do escopo (o 30B não toca em `wrangler`): `head_sampling_rate` menor, desligar `invocation_logs` no `foode-web` ou mover o token para o fragmento (`#`). Fica para decisão do Dono.

## 8. Webhooks e dados de cartão

- AbacatePay: segredo em `?webhookSecret=` comparado no servidor. A query nunca vai para log ou Sentry (`redactPath`, `scrubSentryEvent` apaga `query_string`).
- Efí: notificação com segredo na query e consulta por `GET /v1/notification/:token`. Corpo, URL e token ficam fora dos logs. O breadcrumb de saída foi corrigido em S3.
- Cartão: número, CVV e validade nunca saem do navegador. Os schemas são estritos (`packages/shared/src/payment/card.ts`, "qualquer campo a mais (ex.: `number`, `cvv`) é recusado") e a api recebe só o token de uso único do SDK + pagador. O CPF do pagador chega mascarado ao navegador quando vem da conta (`useAccountCpf`). **Ok.**

## 9. Widget de suporte

Entregue nesta branch (contrato e integração em [`docs/integracao-suporte-agentes-chat.md`](../docs/integracao-suporte-agentes-chat.md)). Os pontos relevantes para dados pessoais:

- Sem configuração, nada carrega. Com configuração, o widget **não monta** em `/loja/{slug}/pedido/{token}` nem em `/definir-senha` (token na URL).
- Nunca `wa.me`: a configuração com host do WhatsApp é recusada.
- Testes: `packages/shared/src/support-widget.test.ts`, `apps/web/src/components/support-widget.test.tsx`, `apps/admin/src/components/support-widget.test.tsx` e `apps/web/.../conta/login-flow.test.tsx` (conflito com o widget ligado e desligado).

## 10. Pendências

1. **Varredura de logs/Sentry de produção depois do smoke** (passo do runbook): procurar telefone, CPF, e-mail, endereço, dado de cartão, URL com segredo e corpo de webhook em Workers Logs (`foode-api`, `foode-web`, `foode-admin`) e nos três projetos do Sentry. Inclui a verificação manual do Pixel (§5).
2. **K3: Sentry do Painel (`apps/admin`)**, encaminhado. `instrumentation-client.ts`, `sentry.server.config.ts` e `sentry.edge.config.ts` não têm `beforeSend`. `/definir-senha?token=…` (convite e redefinição de senha) iria inteira em `request.url`/breadcrumbs. Correção sugerida: aplicar o mesmo `scrubEvent`/`scrubBreadcrumb` de `apps/web/src/lib/sentry-scrub.ts`, redigindo também a query `token`. Não foi aplicada aqui porque o 30B só toca o layout raiz do admin.
3. **R3:** token do Pedido nos Workers Logs (decisão do Dono, mexe em `wrangler`).
4. **A1:** auditoria da busca com conta como `not_found` (só com migration).
5. **R1/R2:** riscos residuais aceitos pelas decisões 65 e 68.
6. `deploy.yml` ainda não repassa `NEXT_PUBLIC_SUPPORT_WIDGET_*` aos builds (ver o documento de integração, §2).
