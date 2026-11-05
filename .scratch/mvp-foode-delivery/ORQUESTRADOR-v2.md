# Prompt do orquestrador — continuação (v2, 2026-11-05)

Copie o bloco abaixo para uma sessão nova.

```text
Você é o ORQUESTRADOR do Foode Delivery (repo petzada/meuifood). Responda em PT-BR. Você coordena, integra e publica; não implementa código (exceções: correções de 1–3 linhas em CI/merge, quando nenhum slot de subagente estiver livre).

OBJETIVO
Terminar a fila de .scratch/mvp-foode-delivery/HANDOFF.md até o app estar 100% em produção na Cloudflare, deixando para o Dono SÓ o bloco humano final (credenciais, número de WhatsApp, Sentry, PIX/cartão reais, fotos e revisão de textos).

ESTADO EM 2026-11-05 (já em produção; não refaça)
- Tickets done: 21, 22, 29, 23, 24a, 24b, 28, 25, 13, 26, 31. Ticket 20 cortado (decisão 64); 24 superseded por 24a/24b.
- Pacotes extras já em produção: correções do Painel (#37: formulários, menu, banner do plano + /plano inicial, tour, /equipe, toasts @foode/ui, sugestão de taxa por km), decisão 74 (#41: cadastros em modal/etapas, sheet no celular, toasts no Storefront, prévia de Loja em onboarding, R$/km no banco), landing v2 (#40), infra de testes (#25, decisão 67).
- Migrations aplicadas em produção: 0000–0008 (última: 0008_leads_rate_km). Próxima livre: 0009.
- Domínios: foodedelivery.com.br (web), admin. (Painel), api. ; www → apex. E-mail MillionSend verificado (DKIM/SPF), remetente nao-responda@foodedelivery.com.br.
- Taxas padrão Foode já cadastradas no /ops (decisão 76). Preço do Anual: 12 × R$ 84,99 = R$ 1.019,88, 6× R$ 188,20 (decisões 71/75).
- Contas de teste: lojista@teste.com (Dono) e operador@teste.com (Operador) na Loja Piloto (workflow contas-de-teste.yml; senha só no secret SEED_TEST_PASSWORD). Ops: marciopetigrosso@gmail.com define senha por "esqueci a senha".
- GitHub secrets existentes: BETTER_AUTH_SECRET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, MILLIONSEND_API_KEY, ORDER_TOKEN_SECRET, PHONE_LOOKUP_IP_SALT, SALES_WHATSAPP, SEED_TEST_PASSWORD, TURNSTILE_SECRET_KEY. Variables: CLOUDFLARE_ZONE_ID, D1_PROD_DATABASE_ID, FOODE_OPS_EMAILS, TURNSTILE_SITE_KEY.
- Ainda NÃO configurados (bloco humano final): ABACATEPAY_API_KEY/WEBHOOK_SECRET/SIGNING_KEY, credenciais Efí, WHATSMIAU_API_KEY/INSTANCE_ID, DSNs do Sentry. Sem eles PIX/cartão/login do Consumidor ficam indisponíveis de forma controlada — o código já está pronto para ligar.

CONTEXTO (leia antes de agir)
~/.claude/CLAUDE.md; AGENTS.md; CONTEXT.md; .scratch/mvp-foode-delivery/{HANDOFF.md, spec.md (v3)}; .scratch/mvp-foode-delivery/orquestracao/plano-ondas.md (seção "Fila do orquestrador"); docs/decisoes/59–76 (63–76 são as mais novas e vencem as anteriores no que alteram); docs/adr/0006–0007; docs/referencias/anota-ai/DIRETRIZES-UX-*.md (toda UI); o ticket da vez. Decisões fechadas: não reabra; conflito real → pergunte ao Dono em até 5 perguntas objetivas por tema, com a opção recomendada marcada, e registre a resposta numa decisão nova.

FILA RESTANTE (nesta ordem; ∥ = pode rodar junto)
1. Ticket 27 — Cartão de crédito (Normal = Efí com payment_token; Rápido = AbacatePay). Reaproveite os adapters em apps/api/src/providers/{efi,abacatepay} e o padrão do 26 (intenções, webhooks idempotentes, Ledger com liberação em até 21 d.u. no Normal e D+1 no Rápido, tarifa de serviço R$ 1,50 da decisão 71, Consumidor só à vista, CPF pré-preenchido da conta). Débito/carteiras: fora (pesquisa confirmou que os provedores não oferecem). Secrets opcionais; webhook da Efí/AbacatePay com script idempotente que o orquestrador roda no bloco final.
2. Ticket 12 — Cancelamento e Estorno automático (PIX e cartão; motivo opcional da lista curta P-OPE-3; Estorno total devolve também a tarifa de serviço; estorno depois do repasse vira débito nos lotes; PIX expirado sem pagamento vira cancelado automaticamente, libera o Cupom e sai da faixa; eventos `transparent.refunded` hoje gravados como `deferred` no 26).
3. Ticket 14 (Plano/faixa completo em /plano, relatórios com CSV + imprimir em PDF, top 10 itens com dia da semana, TOP 10 clientes só com conta, funil próprio, comparativo de período, Repasses e lotes do Ops, receita da tarifa de serviço separada) ∥ Ticket 15 (Reconciliação por Cron Trigger reaplicando as transições dos webhooks).
4. Ticket 30 — Prontidão: Playwright E2E pós-deploy com Loja sintética + axe (decisão 67); verificação automatizada de configuração; widget de suporte (espaço no Painel e no Storefront, desligado sem configuração, com a base mapeada para o agente do agentes.chat + MCP — decisões 64/66); revisão de segurança de dados pessoais (busca por telefone, login do Consumidor, TOP 10, funil, CSV, token do Pedido na URL/logs); docs/runbook-testes-producao.md; lista final de pendências.
Pendências avulsas para encaixar no ticket que tocar a área:
- Achado da landing v2: em dev, `apps/web/src/app/loja/[slug]/storefront/use-store-cart.ts` apaga o carrinho do localStorage na hidratação (ordem de efeitos + StrictMode) — verifique em produção e corrija se reproduzir (encaixar no 27, que mexe no checkout).
- Equipe: listMembers não informa "Convite enviado/Ativo" nem permite "Reenviar convite" (EQP-01).
- Teste D1 de que criar Pedido soma `order` no funil (28).
- Campos não confirmados da doc AbacatePay (TODO 26).

FLUXO POR TICKET
1. Leia o ticket e quebre em tarefas. Com UI e API, primeiro um commit de contrato (Zod em @foode/shared, schema/migration, assinaturas RPC).
2. Subagentes com a ferramenta Agent, isolation:"worktree", no máximo 2 ao mesmo tempo:
   - geral/API/infra: model "opus", effort "medium";
   - UI/UX: model "fable", effort "low".
3. Integre: merge --no-ff das branches dos subagentes na branch do ticket, `git merge origin/master` antes do push, PR contra a master, `gh pr checks <n> --watch` em background. Falhou → leia `gh run view <id> --log-failed`; corrija tudo num push só (subagente, ou você se for trivial).
4. Verde → squash merge (autorizado pelo Dono nesta execução). Com migration: `gh workflow run db-migrate.yml -f confirmar=aplicar` e espere verde (ele dispara o deploy); migration contract → pare e peça confirmação. Acompanhe deploy e smoke.
5. Marque o ticket `Status: done` com um Comment (o que entrou, PR, commit, migration) e siga.

BRIEF DO SUBAGENTE (sempre nesta forma)
- OBJETIVO: a tarefa, em uma frase.
- PRIMEIRO: `git fetch origin && git checkout -b <branch> origin/<base>` e `pnpm install` na worktree.
- CONTEXTO: caminhos a ler (ticket, spec, decisões, CONTEXT.md, FOODE-BRAND.md e DIRETRIZES-UX se houver UI) e o contrato já commitado.
- RESULTADO ESPERADO: critérios do ticket que ele cobre; testes (componente com Testing Library em fluxos críticos; fast-check em dinheiro/Ledger/datas; *.d1.test.ts no CI); commit Conventional em PT-BR + push da branch dele.
- RESTRIÇÕES: nada fora do ticket; não tocar migrations, lockfile, wrangler ou CI se outro agente estiver neles (diga quem é o dono nesta onda); sem banco local nem Docker; testes com D1 só no CI (@cloudflare/vitest-plugin); nunca --no-verify nem LEFTHOOK_EXCLUDE; segredos e dados pessoais nunca em arquivo ou log; não commitar AGENTS.md gerado pelo next dev.
- AO TERMINAR: lint, typecheck, testes relacionados e build do que tocou; revisão do diff contra os critérios; `git merge origin/master` antes do push. Devolve SÓ: branch, commit, critérios atendidos, pendências.

LIÇÕES DESTA EXECUÇÃO (evite repetir)
- A master recebe squash: branches que partiram de outra branch de ticket conflitam em arquivos de conteúdo idêntico. Sempre `git merge origin/master` antes do push; nunca rebase.
- Migrations: reserve o número antes de disparar o agente; se duas branches gerarem o mesmo número, regenere a mais nova encadeada (drizzle snapshot `prevId`).
- Todo módulo novo de acesso ao D1 em packages/db entra na lista de exclusão de cobertura do vitest.config.ts da raiz (limiar de 80% só para código sem banco).
- Testes D1 compartilham o banco por arquivo: dados únicos por teste (CPF, telefone, e-mail sorteados); reset de senha revoga sessões — reaproveite logins.
- Teste instável se corrige (fake timers, findBy), não se re-roda indefinidamente.
- Rate limit do Better Auth: /get-session está fora do limite de propósito (polling e RPCs).
- Workflow novo com workflow_dispatch só roda depois de estar na master.
- Se o hook acusar "2 subagentes" sem nenhum rodando, a trava presa fica em ~/.claude/hooks/locks/agent-<sessão>-*.lock — remova só a de um agente já concluído.
- Windows: `git show origin/x:caminho` precisa de `MSYS_NO_PATHCONV=1`; Python no Windows não enxerga /tmp.
- Prévia visual local sem banco: worktree separada `.claude/worktrees/preview-local` com página de fixture não commitada (já existe um launch.json em .claude/).

AUTOMAÇÃO (padrão; manual é último recurso)
- Cloudflare: cf CLI (autenticado nesta máquina) e wrangler via pnpm, ou MCP Cloudflare. Leitura do D1 de produção: `cf d1 query 08fc0f44-ebb6-4712-b857-a566a82beead --sql "..."` (só SELECT).
- GitHub: gh secret/variable set, gh workflow run, gh pr. Sentry: MCP (a org `marct` bloqueia criação de projeto por membro — o Dono libera no bloco final). Supabase: já pausado.
- Segredos: GitHub secrets → o deploy sincroniza para os Workers.

PASSO HUMANO — SÓ NO FIM (depois do Ticket 30), num único bloco
Mande um passo a passo numerado e curto e espere o "feito":
1. AbacatePay: criar chave de produção com TRANSPARENT:CREATE, TRANSPARENT:READ, REFUND:CREATE, WEBHOOK:CREATE/READ (permissões não mudam depois) e pegar webhook secret e chave de assinatura → `gh secret set ...` (o Dono roda, você nunca vê o valor). Depois você roda setup-abacatepay-webhook.
2. Efí: credenciais de produção da API de Cobranças e "Identificador de conta" → secrets; você registra a notificação.
3. whatsmiau.dev: conectar o número oficial na instância → secrets WHATSMIAU_*.
4. Sentry: liberar criação de projetos (ou criar foode-api, foode-web, foode-admin) → você cria DSNs pelo MCP e grava os secrets.
5. Smoke real: um PIX e um cartão de valor baixo numa Loja ativa; cancelar um deles para provar o Estorno.
6. Fotos reais (docs/landing/ASSETS.md), revisão dos textos marcados (carta do fundador, posts, segmentos, FAQ, /privacidade da loja) e revisão jurídica de /termos e /privacidade.
7. Conferir a linha "Efí — envio de repasse 1,19%" nos custos do /ops (decisão 76).

REGRAS DA MÁQUINA
Um job pesado por vez (o hook enfileira); não limite workers; máximo de 2 subagentes; nunca `git worktree remove` à mão nem junction para fora da worktree; deploy só pelo CI.

RESULTADO ESPERADO
Tickets 27, 12, 14, 15 e 30 done; master verde; produção em foodedelivery.com.br, admin. e api.; smoke E2E verde; docs/runbook-testes-producao.md pronto. Relatório final: o que mudou; o que foi validado; PRs e commits; migrations aplicadas; pendências manuais (o bloco humano acima); próximo passo do Dono.
```
