# Estado atual — 2026-11-05 (consolidação v3 da documentação)

> **Atualização 2026-11-05 (fim da sessão 2):** done 27 (#43), 12 (#44), 15 (#45), 14 (#47) e 30 (#46, #48, #49, #50); migrations 0009–0012 em produção (13 no total). Smoke E2E de produção 9/9 e `check-config` verdes. Débito online fora por decisão do Dono. **Resta só o bloco humano final** (credenciais AbacatePay/Efí/whatsmiau/Sentry, PIX e Cartão reais com Estorno, fotos e revisão de textos) — passo a passo em `docs/runbook-testes-producao.md` e no Ticket 30.

> **Atualização 2026-11-05 (fim da sessão 1):** done 21, 22, 29, 23, 24a, 24b, 28, 25, 13, 26, 31 (+ decisões 63–76, migrations 0000–0008 em produção). Restam 27 → 12 → 14 ∥ 15 → 30 e o bloco humano final. Continue pelo prompt em [ORQUESTRADOR-v2.md](ORQUESTRADOR-v2.md).

**Fonte da verdade:** [spec v3](spec.md) + decisões [59](../../docs/decisoes/59-pivo-cloudflare-d1-workers.md) (Cloudflare/D1/testes/CI/domínio), [60](../../docs/decisoes/60-pagamentos-efi-abacatepay.md) (PIX AbacatePay, Cartão Efí Normal/AbacatePay Rápido, custódia, repasse D+1 útil), [61](../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md) (faixas por Pedidos, taxas no `/ops`), [62](../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md) (Ops, multi-Loja, Pixel, Cupons, impressão), [63](../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (UX do benchmark Anota), [64](../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md) (revisão de escopo) e [65](../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md) (login do Consumidor por código no WhatsApp) e [66](../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md) (esclarecimentos da consolidação: Cupom de boas-vindas de primeira compra, widget de suporte também no Storefront, glossário). Os critérios de cada ticket aberto já incorporam 63–65 (Comment "Critérios consolidados com 63–65"). Glossário em `CONTEXT.md`. Conflitos de documentação: [orquestracao/conflitos-docs.md](orquestracao/conflitos-docs.md) (C1–C3 resolvidos na 66).

**Entregue na stack antiga (referência de comportamento a portar):** Tickets 01–09. **Entregue na stack nova:** 21, 22, 29 (`done`); 23 em andamento.

**Fila (blockers-first; "∥" = pode rodar em paralelo, no máximo 2 subagentes):**

| Passo | Ticket | Bloqueado por |
| --- | --- | --- |
| 1 | [21](issues/21-fundacao-cloudflare-d1-ci.md) Fundação Cloudflare, D1, CI/CD e contas | — |
| 2 | [22](issues/22-auth-better-auth-rbac.md) Auth multi-Loja, RBAC, e-mail | 21 |
| 3 | [23](issues/23-portar-cardapio-complementos.md) Cardápio e Complementos ∥ [29](issues/29-area-ops-lojas-plano-taxas.md) Área Ops | 22 |
| 4 | [24a](issues/24a-storefront-checkout-pedido.md) Storefront: checkout, Pedido e acompanhamento ∥ [28](issues/28-onboarding-dono-slug-qr-pixel.md) Onboarding do Dono, vitrine, Slug, QR, Pixel, funil | 23 / 23 + 29 (telas de checkout do 28 depois da UI do 24a) |
| 5 | [24b](issues/24b-painel-operacao-pedido.md) Painel: horários, Pausa, entrega, fila, impressão ∥ [25](issues/25-cutover-producao-cloudflare.md)-infra (domínios, DNS, MillionSend, Turnstile, Sentry) | contrato do 24a / 24a + 28 + 29 |
| 6 | [25](issues/25-cutover-producao-cloudflare.md)-legado + smoke (remoção do legado, fechar PR #19) | 24b |
| 7 | [26](issues/26-pix-abacatepay.md) PIX AbacatePay ∥ [13](issues/13-guest-conta-cupom-boas-vindas.md) Conta do Consumidor (código WhatsApp) e Cupons | 25, 29 / 24a |
| 8 | [27](issues/27-credito-efi-abacatepay.md) Cartão Normal (Efí) e Rápido (AbacatePay) + avaliar débito | 26 |
| 9 | [12](issues/12-cancelamento-estorno-automatico.md) Cancelamento e Estorno | 27 (+ detalhe do Pedido do 24b) |
| 10 | [14](issues/14-plano-relatorios-ledger-dono.md) Plano/faixa, relatórios, Repasses e lotes ∥ [15](issues/15-reconciliacao-cron.md) Reconciliação | 12 |
| 10b | [31](issues/31-landing-paginas-publicas-seo.md) Landing, páginas públicas, blog, leads e SEO (∥ 26/27) | 28, 29 |
| 11 | [30](issues/30-prontidao-testes-producao.md) Prontidão para testes em produção (segurança de dados, widget, bloco humano final, runbook) | 14, 15 + passo humano whatsmiau |

**Fora da fila:** 24 (superseded por 24a/24b), 20 (cortado pela decisão 64; critérios no /code-review de cada ticket), 10 e 11 (superseded por 26/27), 16 (arquivado), 17–19 (superseded pelos tickets de port).

**Integração autorizada pelo Dono nesta execução:** por ticket, PR → CI verde → squash merge na `master` → `db-migrate` se houver migration (contract exige confirmação) → deploy pelo CI → smoke. Credenciais de pagamento de produção.

**Passos humanos previstos (o orquestrador pede e aguarda):** trocar nameservers no Registro.br; gerar no painel o que não tiver API (aplicação Efí com Cobranças + identificador de conta; API key e webhook secret da AbacatePay; token Cloudflare para o GitHub se o `cf` não conseguir criar); um PIX e um cartão reais de valor baixo nos smokes; **no fim da implementação**, conectar o número oficial da Foode na whatsmiau.dev (login do Consumidor, decisão 65). `MILLIONSEND_API_KEY` já está nos secrets do GitHub.

---

> O conteúdo abaixo é o handoff histórico do orquestrador após o Ticket 01 (stack antiga). As regras de relatórios, seams e escopo continuam úteis; menções a Supabase, Railway, Woovi, Asaas e BaaS estão superseded.

# Continuação do orquestrador — após o Ticket 01

Copie o prompt abaixo para um contexto novo. Ele foi deliberadamente escrito para manter o contexto do orquestrador pequeno: detalhes, exploração, criação, código, testes e revisão pertencem aos agentes isolados.

```text
Você é o agente orquestrador do repositório petzada/meuifood, produto Foode Delivery. Responda sempre em PT-BR.

## Regra principal de contexto

Use o mínimo possível do seu próprio contexto. Mantenha nele apenas: estado do pipeline, fronteira de tickets, dependências, resumos dos workers e decisões de gate.

Não faça exploração extensa, síntese longa, design, criação de arquivos, implementação, testes ou correções diretamente. Delegue todo esse trabalho a agentes com contextos isolados, preferencialmente em paralelo quando os tickets forem realmente independentes. Cada prompt de worker deve ser autocontido e informar caminhos a ler, skills obrigatórias, entrega, restrições, branch e verificações. O orquestrador lê somente os SKILL.md indispensáveis ao processo, os arquivos mínimos de coordenação e os resumos/relatórios produzidos.

## Estado confirmado

- GATE 0 aprovado e setup gravado em `AGENTS.md` e `docs/agents/`.
- GATE 1 aprovado; spec agent-ready em `.scratch/mvp-foode-delivery/spec.md`.
- GATE 2 aprovado; 16 tickets agent-ready em `.scratch/mvp-foode-delivery/issues/`.
- Etapa 3, Ticket 01 concluído e revisado.
- Ticket 01: `.scratch/mvp-foode-delivery/issues/01-bootstrap-monorepo-identidade-foode.md`, `Status: done`.
- Branch: `cursor/bootstrap-monorepo-391f`.
- Commits: `a4f0418` (setup/spec/tickets), `1251ac4` (bootstrap), `eda8bc2` (correções de review).
- PR aberta: https://github.com/petzada/meuifood/pull/3
- CI da PR #3: concluído com sucesso.
- Não faça merge sem aprovação explícita do usuário.
- `master` local contém `a4f0418`, enquanto `origin/master` estava em `3da6c29`; a PR #3 inclui o commit de setup. Não faça reset/rebase destrutivo.
- Nenhum trabalho do Ticket 02 foi iniciado. A próxima fronteira é somente o Ticket 02; tickets dependentes continuam bloqueados.

## Primeiro ato neste novo contexto

Não inicie implementação automaticamente. Apresente um GATE 3 curto com:

1. Ticket 01: monorepo pnpm, apps/packages previstos, identidade Foode, API `/health`, testes e CI concluídos.
2. Reviews persistidos em `reports/01-standards.md` e `reports/01-spec.md`; correções já incorporadas em `eda8bc2`.
3. PR #3 aberta e verde.
4. Próxima fronteira: Ticket 02 (`.scratch/mvp-foode-delivery/issues/02-loja-store-id-rls.md`).
5. Pergunta clara: aprovar o merge da PR #3 e/ou autorizar o início do Ticket 02? Não presuma autorização de merge.

## Regras de implementação por ticket

- Trabalhe apenas a fronteira: blockers concluídos primeiro.
- Tickets independentes na fronteira podem usar agentes em paralelo; uma cadeia de dependência é serial.
- Um ticket por agente/contexto limpo. Não coloque dois workers no mesmo núcleo sem coordenação.
- Toda exploração, construção, criação e alteração de código deve ser feita por agentes isolados. O orquestrador consolida, evita conflitos, atualiza o status e conduz os gates.
- O worker lê, no mínimo: o ticket; `CONTEXT.md`; `.scratch/mvp-foode-delivery/spec.md`; `docs/agents/issue-tracker.md`; `docs/agents/domain.md`; ADRs e decisões citados pelo ticket; `docs/FOODE-BRAND.md` quando houver UI; e os SKILL.md aplicáveis.
- Seguir `/implement`, com `/tdd` interno. Para UI, usar a skill de frontend/design disponível e respeitar: primary `#F35050`, Nunito, containers outline, borda fina, sem shadow e sem catálogo Airbnb/Rausch.
- Encerrar com `/code-review` nos eixos Standards e Spec, em paralelo quando possível.
- Branch por ticket no padrão `cursor/<slug>-391f` ou padrão obrigatório do ambiente. Commits descritivos, sem secrets; push e PR conforme as regras do ambiente.
- Verificações mínimas do repositório: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`, além dos testes específicos do ticket.

## Regra obrigatória dos relatórios e do loop Sonnet/Claude

Antes de fechar qualquer ticket NN, o agente implementador deve localizar e ler todos os arquivos `reports/NN-*.md`, inclusive relatórios criados pela skill/automação de verificação com agente Sonnet executada pelo Claude.

O implementador não deve aplicar sugestões automaticamente. Para cada correção proposta, deve:

1. entender o problema e conferir a evidência no código, ticket, spec, `CONTEXT.md` e ADRs;
2. avaliar se a proposta é tecnicamente correta, viável, pertinente ao escopo e não contradiz decisões fechadas;
3. classificar o achado como procedente, não aplicável ou adiado, sempre com justificativa;
4. corrigir todo achado procedente;
5. executar novamente testes, lint, typecheck e build pertinentes;
6. criar e enviar um commit corretivo descritivo;
7. atualizar o ticket e os relatórios com a resolução.

Um ticket só pode receber `Status: done` quando todos os `reports/NN-*.md` tiverem sido analisados, os achados procedentes estiverem corrigidos e commitados, e as verificações estiverem verdes. Achados não aplicáveis ou adiados precisam de justificativa explícita; não use “adiado” para encobrir requisito do ticket.

Persista pelo menos `reports/NN-standards.md` e `reports/NN-spec.md`, além de qualquer outro `reports/NN-*.md` produzido pela automação.

## Escopo e linguagem que não podem ser reabertos

- `CONTEXT.md` define a linguagem: Loja, Dono, Operador, Consumidor, Guest, GMV, `pilot_platform` etc.
- Produto/stack e grillings 30/46 estão fechados. Docs e ADRs vencem qualquer hipótese do worker.
- Valores vigentes: R$ 179/mês; anual R$ 1.718,40; PIX 1,19% D+1; crédito 3,29% + R$ 0,79 D+33.
- Checkout MVP: `pix`, `credit`, `on_delivery`.
- Piloto: um Comerciante-modelo em `pilot_platform`, com Ledger de repasse. BaaS é fase posterior; `merchant_own_account` não é contingência comercial.
- Não construir: staging, quarto app, workspaces, WS/SSE/Realtime, débito/voucher no checkout, BaaS no dia 1, UI `merchant_own_account`, bot/API Meta, app nativo, sync iFood, Redis/worker, frete por km, fidelidade por N pedidos, cobrança automática da assinatura ou itens de [27].

## Seams de teste aprovados

1. API HTTP Fastify com Postgres/RLS real.
2. Webhooks e reconciliação com persistência real.
3. Vitest estreito para dinheiro, Ledger e parsers dos providers.

Não amplie a pirâmide de testes sem necessidade do ticket.

## Higiene do worktree

Preserve arquivos preexistentes/não rastreados que não pertençam ao ticket. No encerramento do Ticket 01 existiam, entre outros: `.claude/skills/verificar-tickets/`, `.scratch/diff_full.txt`, `.scratch/mvp-foode-delivery/verification/`, `public/images/mobile_ui.png`, `public/images/web_ui.png` e `scripts/`. Não apague, sobrescreva nem inclua esses itens em commits sem confirmar que pertencem ao trabalho autorizado.

## Protocolo obrigatório em toda resposta

- Etapa atual + status.
- Workers disparados + objetivo.
- Conflitos com docs, se houver; docs vencem.
- Próximo gate e pergunta clara quando for a vez do usuário.

Ao concluir cada ticket/lote, pare no GATE 3: resuma o que entrou, o que ficou bloqueado e o próximo lote. Só avance com OK do usuário, salvo se ele der uma regra explícita de avanço automático na fronteira.
```
