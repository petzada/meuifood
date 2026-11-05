# Plano de ondas (2 subagentes) — Tickets 22→30 (24 dividido em 24a/24b em 2026-11-05)

Fatia "C" = commit de contrato (Zod em `packages/shared/src/<domínio>/*`, `packages/db/src/schema/<domínio>.ts`, assinaturas RPC) e dona da migration do ticket.

| Onda | A | B |
|---|---|---|
| 0 | 21 | pesquisa (Better Auth/D1, MillionSend, AbacatePay, Efí, débito) |
| 1 | 22-C (migration auth) | 23-pré (shared money/menu, @foode/ui) |
| 2 | 22-API (lockfile) | 22-UI (admin entrar/definir-senha, seletor de Loja, navegação) |
| 3 | 23-C (migration menu, R2) | 29-C (Zod ops) |
| 4 | 23-API | 29-API (migration ops) |
| 5 | 23-UI | 29-UI |
| 6 | 24a-C (migration 0004: Pedido + configuração operacional) | 26-pré (adapter AbacatePay, dias úteis) |
| 7 | 24a-API (checkout, busca por telefone, criação idempotente) | 28-C+API (migration 0005: perfil, vitrine, Pixel, eventos do funil) |
| 8 | 24a-UI (checkout, Sobre a Loja, página do Pedido) | 24b-API (RPCs de configuração, Pausa, fila; migration 0006 só se precisar) |
| 9 | 24b-UI (configurações, fila, chips, tour) | 28-UI (lockfile QR; telas de checkout depois do 24a-UI) |
| 10 | 24b-impressão (80 mm, Imprimir ao aceitar, Avisar no WhatsApp) | 25-infra (rotas/domínios/DNS/MillionSend/Turnstile) |
| 11 | 25-legado (lockfile) | 13-C+API (migration 0007, login WhatsApp) |
| 12 | 25-docs+smoke | 13-UI |
| 13 | 26-C+API (migration 0008) | 27-pré+C |
| 14 | 26-UI | 27-API (migration 0009) |
| 15 | 27-UI (lockfile Efí) | 12-C+API (migration 0010) |
| 16 | 12-UI | 14-C |
| 17 | 15-API (migration 0011, cron) | 14-API |
| 18 | 14-migration 0012 + lotes | 30-ops (rascunho runbook, revisão de segurança) |
| 19 | 14-UI | 30-ops (widget + base agentes.chat) |
| 20 | 30-E2E (lockfile) | 30-ops final (bloco humano) |

Regras: numeração de migrations reservada pelo orquestrador (efetivo: 21→0000, 22→0001, 29→0002, 23→0003; reservadas em 2026-11-05: 24a→0004, 28→0005, 24b→0006 só se precisar, 13→0007, 26→0008, 27→0009, 12→0010, 15→0011, 14→0012; se o 24b não usar a 0006, o próximo ticket a integrar com migration assume o número livre regenerando com `pnpm db:generate`, como foi feito no 23; histórico: a reserva anterior era 24→0004, 28→0005, 13→0006, 26→0007, 27→0008, 12→0009, 15→0010, 14→0011); um dono por onda de lockfile, wrangler.jsonc, CI; schema partido por domínio; subpath exports; navegação do admin é do 22-UI; caminho de escrita do Pedido: 24a→13→26→27→12 (o 24b só lê/transiciona o Pedido); 25-infra após 24a/28/29 e 25-legado só após 24b/28/29 na master.

2026-11-05: Ticket 20 cortado (decisão 64); critérios do 20 entram no /code-review de cada ticket de UI. UI de cada ticket segue docs/referencias/anota-ai/DIRETRIZES-UX-*.md e decisões 63/64.

2026-11-05: Ticket 24 dividido em 24a (Storefront, dono do contrato e da migration 0004) e 24b (Painel); migrations renumeradas a partir da 0006 (reservada ao 24b). Tour de 3 passos (P-ONB-1) passou do 28 para o 24b.

## Fila do orquestrador (2026-11-05, pedidos do Dono ainda não despachados)

Próximo agente "decisão 74" (Opus, api+web+admin), escrever `docs/decisoes/74-padrao-cadastro-modal.md`:
- Todo cadastro do lojista em modal (desktop, fundo desfocado) / sheet inferior (mobile); etapas quando houver mais de uma (item: Dados → Complementos → Adicionais, com "Pular"; ao concluir volta ao Cardápio com toast); sem o link "Configurar complementos e adicionais agora"; edição com abas.
- Menos scroll vertical no desktop (abas/etapas); Cardápio vindo do onboarding só com "Adicionar item" (topo) e "Criar categoria" (esquerda).
- Toast padrão (packages/ui, do agente do Painel) também no Storefront.
- Loja em `onboarding`: Storefront mostra o Cardápio em prévia com faixa "Esta Loja ainda não está recebendo pedidos", checkout bloqueado, noindex (api passa a devolver o menu com estado; `suspended` continua indisponível).
- Nota na decisão 71: Anual sem teto de Pedidos (plano mais completo) = faixa básica × 12, até 6× com 2,99%; badge "66%" correto.

Próximo agente "landing v2" (Fable, apps/web): corrigir motions bugados (principalmente "Como funciona": o passo a passo da esquerda some ao rolar — sticky/scrollytelling quebrado); parallax de verdade: ao rolar, os mockups sobem e COBREM o hero (camada à frente, velocidade diferente, overlap real), não só deslocam; mockups realistas (capturas reais das telas do Storefront e da fila em moldura de celular/laptop fiéis, sombra de mockup permitida só na moldura do dispositivo se a marca permitir — confirmar com FOODE-BRAND; senão borda), sem desenho artificial; revisar todos os efeitos em desktop e 375 px, com prefers-reduced-motion e sem CLS.

Pendente "taxas padrão (decisão 76)": cadastrar em produção a tabela padrão de taxa Foode (PIX 1,19%; Cartão Normal 3,49% + R$ 0,99; Rápido 5,42% + R$ 1,59) com vigência, por migration de dados expand ou RPC do Ops; preço do Anual NÃO muda (decisão 75 corrigida: 12 × R$ 84,99).
