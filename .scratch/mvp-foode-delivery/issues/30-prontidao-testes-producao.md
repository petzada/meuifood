# 30 — Prontidão para testes em produção

**What to build:** Um smoke E2E automatizado contra produção, uma revisão de segurança dos dados pessoais, o espaço do widget de suporte (desligado sem configuração) com a base de integração mapeada, o bloco humano final com credenciais e pagamentos reais e um runbook curto permitem ao Dono testar o Foode de ponta a ponta com uma Loja real criada pelo `/ops`.

**Blocked by:** 14 — Plano, relatórios, Repasses e lotes; 15 — Reconciliar pagamentos e repasses por Cron Triggers. Antes dele, o passo humano da whatsmiau.dev (decisão [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md)).

**Status:** done (código e automação; resta o bloco humano final)

**Agente:** Opus (geral).

### Smoke e verificação automatizada

- [ ] Playwright (Chromium) no CI após o deploy: Storefront de Loja sintética de smoke, busca no Cardápio, carrinho, checkout `on_delivery` com troco, Pedido na fila do Painel, impressão renderiza, Pausa pelo Operador bloqueia o checkout, `/ops` acessível só ao Ops; dados de smoke criados e removidos pelo próprio teste.
- [ ] O smoke confere os estados vazio/carregando/erro da fila e do `/ops` (T-04).
- [ ] Verificação automatizada de configuração: secrets presentes nos Workers (incluindo AbacatePay, Efí, whatsmiau, MillionSend, Turnstile, Sentry), webhooks registrados, DNS/e-mail verificados, Sentry recebendo eventos, Cron Trigger ativo, D1 com migrations em dia.

### Revisão de segurança dos dados pessoais

- [ ] **Busca por telefone no checkout (P-2.1):** só retorna dados da mesma Loja; resposta mascarada (primeiro nome e rua sem número) até "Sou eu"; rate limit por IP e Turnstile ativos em produção; auditoria gravada sem telefone em claro; teste de enumeração (vários telefones seguidos do mesmo IP) bloqueado.
- [ ] **Login do Consumidor (65):** código só em hash, uso único, 5 tentativas, 5 min, reenvio em 30 s; rate limit por telefone e IP; mensagens não revelam se o telefone ou CPF tem conta; CPF e telefone fora de logs e Sentry.
- [ ] **TOP 10 clientes (P-REL-3):** só Consumidores com conta, da própria Loja; só nome e totais; sem exportação; Operador negado.
- [ ] **Funil e Pixel (P-REL-4):** eventos agregados por Loja sem IP, telefone, e-mail, CPF, cookie ou id de Consumidor; Pixel sem dado pessoal.
- [ ] **CSV de relatórios:** sem telefone, CPF ou endereço.
- [ ] Varredura de logs/Sentry de produção depois do smoke: nenhum telefone, CPF, e-mail, endereço, dado de cartão, URL com segredo ou corpo de webhook.
- [ ] Resultado registrado em `reports/30-seguranca-dados.md` com achados e correções.

### Widget de suporte no Painel e no Storefront (P-ONB-5 na forma da [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md) e da [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md))

- [ ] Espaço do widget de chat de suporte (chatbot automatizado pelo agentes.chat com MCP) no **Painel e no Storefront**, com a mesma base de integração: ponto de montagem em cada app e carregamento condicionado a configuração (variáveis documentadas); sem configuração, nada carrega nem aparece; sem link `wa.me` de suporte.
- [ ] Com o widget ativo no Storefront, a mensagem de conflito de conta do Ticket 13 mostra "Fale com o suporte Foode pelo chat"; teste cobre widget ligado e desligado.
- [ ] Contrato de configuração e documento de integração (`docs/integracao-suporte-agentes-chat.md`) mapeando o que o agente do agentes.chat e o MCP precisarão (base da codebase, critérios de resposta, escalada ao Dono da Foode); a implementação do agente e do MCP fica pós-lançamento.

### Bloco humano final (o orquestrador pede e aguarda, nesta ordem)

- [ ] whatsmiau.dev: o Dono conecta o número oficial da Foode na instância; o orquestrador grava chave e id da instância como secrets do GitHub → Worker; login do Consumidor testado com um código real.
- [ ] Efí: aplicação com API de Cobranças e identificador de conta da conta Efí do Foode gravados como secrets; `notification_url` respondendo.
- [ ] AbacatePay: API key e webhook secret de produção gravados; webhook registrado.
- [ ] Sentry: DSNs de produção configurados nos três Workers e um evento de teste recebido.
- [ ] Taxas Foode vigentes cadastradas no `/ops` para PIX, Cartão Normal e Cartão Rápido da Loja de teste.
- [ ] Um **PIX real** de valor baixo: Pedido pago, lançamento no Ledger com repasse previsto.
- [ ] Um **Cartão real** de valor baixo em cada modo (Normal e Rápido), seguido de cancelamento com Estorno automático conferido no provedor e no Ledger.
- [ ] Texto da Política de Privacidade (`/privacidade`) revisado pelo Dono.
- [ ] Widget de suporte: decidir com o Dono se ativa no lançamento (Painel e Storefront) e, se sim, gravar a configuração.

### Runbook e pendências

- [x] `docs/runbook-testes-producao.md`: passo a passo para o Dono criar uma Loja no `/ops`, cadastrar taxas, fazer o onboarding como Dono (perfil, checklist, vitrine, Slug, QR, Pixel), configurar horários, entrega, bandeiras e "Imprimir ao aceitar", pedir por PIX, Cartão (Normal e Rápido) e na entrega (com troco), entrar como Consumidor pelo código no WhatsApp, aplicar Cupom, operar a fila (tour, chips, Pausa pelo Operador, "Avisar no WhatsApp", impressão), cancelar com Estorno, ver relatórios (CSV, imprimir, funil), ver Repasses e marcar um lote pago.
- [x] Lista final de pendências manuais (se houver) e de itens pós-MVP (agente de suporte + MCP, débito online se não entrou).
- [x] Pendências/riscos registram: **enquanto o widget estiver desligado, o Consumidor bloqueado por conflito de telefone/CPF não tem canal de suporte** (risco aceito na [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md) até a ativação do widget).

## Comments

- 2026-11-04 — Aberto na revisão final: fecha a execução quando o app está pronto para testes em produção.

- 2026-11-05 — Referência Anota (lojista): o smoke e o runbook conferem os estados de T-04 (vazio/carregando/erro) da fila e do `/ops` em [DIRETRIZES-UX-LOJISTA](../../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md); se P-IMP-1 ou P-ONB-2 de [PERGUNTAS-LOJISTA](../../../docs/referencias/anota-ai/PERGUNTAS-LOJISTA.md) ficarem na opção recomendada, o runbook ganha o modo quiosque de impressão e o Pedido de teste com Pagamento na entrega cancelado.

- 2026-11-05 — Decisão [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) (benchmark Anota): entram neste ticket P-ONB-5 (espaço do widget de chat de suporte, desligado sem configuração); runbook. Vale sobre as perguntas em aberto dos comentários anteriores.

- 2026-11-05 — Decisão [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md): sem wa.me de suporte; espaço do widget + base de integração mapeada para agentes.chat/MCP (implementação pós-lançamento); passa a depender de 14 e 15 (20 cortado).

- 2026-11-05 — Antes da prontidão: passo humano de conectar o número oficial na whatsmiau.dev e gravar os secrets (decisão 65).

- 2026-11-05 — Critérios consolidados com 63–65: bloqueio corrigido para 14 e 15 (o 20 foi cortado); entraram a revisão de segurança dos dados pessoais (busca por telefone, login, TOP 10, funil, CSV), o widget na forma da 64, o checklist do bloco humano final (whatsmiau, Efí, AbacatePay, Sentry, taxas, PIX e Cartão reais, Política de Privacidade) e o runbook ampliado. P-IMP-1 e P-ONB-2 foram decididos de outra forma (configuração "Imprimir ao aceitar"; sem Pedido de teste), então o runbook não inclui modo quiosque nem Pedido de teste.

- 2026-11-05 — Decisão [66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md): o widget de suporte tem espaço também no Storefront (mesma base de integração) e atende o Consumidor bloqueado; sem widget ativo não há canal (risco aceito, registrado nas pendências).

- 2026-11-05 — 30C (branch `feat/30c-391f`): K1 (TOP 10 clientes fora da impressão de `/relatorios`, `foode-print-hide` + `print:hidden`, com teste), K3 (Sentry do admin com o mesmo scrub do web, movido para `@foode/shared/sentry`; redige também `/api/auth/reset-password/:token`), `deploy.yml` repassando `NEXT_PUBLIC_SUPPORT_WIDGET_SRC`/`_ID` (variables `SUPPORT_WIDGET_SRC`/`_ID`, com `_WEB`/`_ADMIN` por app) e o runbook [`docs/runbook-testes-producao.md`](../../../docs/runbook-testes-producao.md). Sem migration. O ticket fica aberto até o smoke de produção verde (o orquestrador marca).

  **Lista final de pendências**

  _Manuais (bloco humano e smoke real, na ordem do runbook):_
  1. Bloco humano final acima: whatsmiau, Efí, AbacatePay + `setup-abacatepay-webhook`, DSNs do Sentry nos três Workers, taxas no `/ops`, PIX e Cartão reais com Estorno, `/privacidade` e a decisão do widget.
  2. Confirmar em sandbox ou no smoke real os pontos marcados no código: `TODO(12)` (a Efí estorna cartão `approved` antes de `paid`? `apps/api/src/refund-service.ts`), `TODO(15)` (Efí `paid`/AbacatePay `PAID` = crédito liberado? `apps/api/src/card-service.ts`), `TODO(26)` (corpos não confirmados da AbacatePay: `/transparents/check`, estorno, `data.transparent`, segredo do webhook; feriados facultativos em `packages/shared/src/business-days.ts`) e os campos da Efí `birth`/`billing_address` (`TODO(27)` em `apps/api/src/providers/efi/client.ts`: exigidos em produção?), além do `tds_identifier` (3DS) e do content-type da notificação.
  3. Varredura de Workers Logs e Sentry depois do smoke real e conferência na aba Rede de que Meta/Google não recebem `/pedido/<token>` (runbook §7); registrar no item 18 de `reports/30-seguranca-dados.md`.
  4. Sentry no navegador: resolvido — o `deploy.yml` passa `SENTRY_DSN_WEB`/`SENTRY_DSN_ADMIN` como `NEXT_PUBLIC_SENTRY_DSN` no build de cada app (DSN é público por natureza; o scrub de `@foode/shared/sentry` vale no cliente).

  _Decisões do Dono e riscos aceitos:_
  5. **Token do Pedido nos Workers Logs** (R3): o caminho `/loja/<slug>/pedido/<token>` aparece nos logs de request da Cloudflare; filtrar exige mexer na `observability` do `wrangler` — decisão do Dono.
  6. **Auditoria `not_found` da busca por telefone** (A1): a busca de telefone com conta Foode fica auditada como `not_found`; um resultado próprio exige migration (enum com CHECK) — melhoria futura.
  7. **Widget de suporte desligado** (decisão 66): enquanto `SUPPORT_WIDGET_SRC`/`_ID` não estiverem gravadas, o Consumidor bloqueado por conflito de telefone/CPF não tem canal de suporte (risco aceito).
  8. **Loja `smoke-foode` no `/ops`**: a Loja sintética do `e2e-producao` aparece na lista de Lojas como "Sem Plano" (esperado; escondê-la ou marcá-la como sintética é melhoria futura).

  _Pós-MVP:_
  9. Agente de suporte do agentes.chat + MCP (pós-lançamento; contrato em `docs/integracao-suporte-agentes-chat.md`).
  10. **Débito online: fora** por decisão do Dono em 2026-11-05 — a API de cartão transparente da AbacatePay não distingue débito de crédito e a Efí só oferece crédito. Débito segue só na maquininha (Pagamento na entrega).
  11. Reconciliação (Ticket 15): cobrança com timeout e webhook perdido não é localizável (adapters sem busca por `custom_id`); contagens de divergência varrem tabelas inteiras (limitar por janela quando houver volume).

- 2026-11-05 — Done (código) nos PRs #46, #48, #49 e #50. Smoke E2E de produção (`e2e-producao.yml`, run 42020446804) **9/9 verde** com a Loja sintética `smoke-foode`; `check-config.yml` (run 42020733336) verde: DNS, e-mail, Cron (`*/5`, `0 9`), D1 com 13 migrations, Turnstile e secrets base ok; faltam só os itens do bloco humano (whatsmiau, AbacatePay, Efí, Sentry). Revisão de segurança em `reports/30-seguranca-dados.md`; runbook em `docs/runbook-testes-producao.md`; widget de suporte pronto e desligado. Itens do bloco humano continuam abertos acima.
