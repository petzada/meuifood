# MVP Foode Delivery

Status: ready-for-agent

> **Versão 2 — 2026-11-04.** Reescrita após o pivô: infraestrutura Cloudflare ([59](../../docs/decisoes/59-pivo-cloudflare-d1-workers.md), [ADR 0006](../../docs/adr/0006-cloudflare-workers-d1-sem-rls.md)), pagamentos AbacatePay/Efí com custódia ([60](../../docs/decisoes/60-pagamentos-efi-abacatepay.md), [ADR 0007](../../docs/adr/0007-efi-abacatepay-provedor-fixo-por-loja.md)), monetização inspirada no Anota AI ([61](../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md)) e área Ops/multi-Loja/funcionalidades ([62](../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md)). Em conflito, as decisões 59–62 vencem; a v1 está no histórico do git.

## Problem Statement

O Comerciante de uma PME que já opera delivery quer reduzir dependência e custo de marketplaces. Ele já traz o Consumidor por WhatsApp, Instagram, QR Code e recorrência, mas precisa de um Canal próprio com Cardápio, checkout, pagamento online e gestão de Pedidos, com custo previsível e sem comissão.

O Dono configura a Loja e acompanha operação e finanças. O Operador trabalha só com Pedidos e status. O Consumidor pede pelo navegador do celular, sem app e sem conta obrigatória. A equipe Foode (Ops) precisa cadastrar Lojas, definir condições comerciais e repassar o dinheiro recebido em custódia, tudo pela interface.

## Solution

SaaS web mobile-first de Canal próprio, 100% na Cloudflare: Storefront (`web`), Painel (`admin`, inclui `/ops`) e API (`api`) como Workers, D1 como banco. Cada Loja é um tenant isolado por `store_id`, com Slug global e Storefront em `/loja/[slug]`. Um usuário pode pertencer a várias Lojas.

O Ops cria a Loja com dados, Plano, faixas, taxas e modo do cartão e convida o Dono, que completa o onboarding (Slug, contato, horários, Delivery/Retirada, Cardápio, Pixel) e divulga link e QR Code. Só Loja `active` recebe Pedidos.

O Consumidor monta o carrinho, escolhe Delivery ou Retirada e paga por PIX (AbacatePay), Cartão de crédito à vista (Efí no modo Normal ou AbacatePay no Rápido) ou Pagamento na entrega, podendo aplicar Cupom. O Painel opera a fila por polling de 10 s com som, imprime Pedidos e cancela com Estorno automático.

O dinheiro online entra nas contas únicas da Foode (`pilot_platform`). O Ledger interno calcula taxa Foode, líquido e repasse D+1 útil após a liberação no provedor; o Ops paga lotes diários por Loja e marca como pagos. A Foode cobra Mensalidade por faixa de Pedidos (fora do app) e taxa Foode por meio de pagamento.

## User Stories

### Ops Foode
1. Como Ops, quero entrar no `/ops` com papel `foode_ops`, para operar a plataforma sem scripts.
2. Como Ops, quero cadastrar uma Loja com nome, CNPJ, Slug inicial, WhatsApp, endereço, chave Pix e titular de repasse, para ela existir em `onboarding`.
3. Como Ops, quero convidar o Dono por e-mail, para ele concluir o onboarding.
4. Como Ops, quero definir Plano (mensal/anual), editar as faixas e ativar ou suspender a Loja, para controlar quem recebe Pedidos.
5. Como Ops, quero definir o modo do cartão (Normal/Rápido) da Loja conforme o contrato.
6. Como Ops, quero manter tabelas padrão de taxa Foode e overrides por Loja com vigência, para precificar sem deploy.
7. Como Ops, quero manter a tabela de custos dos provedores e ver a margem por Loja, para acompanhar a rentabilidade.
8. Como Ops, quero ver todo dia útil o lote "a repassar hoje" por Loja, pagar por fora e marcar como pago com comprovante e custo do envio.
9. Como Ops, quero que toda ação no `/ops` fique auditada.

### Dono
10. Como Dono, quero aceitar o convite, definir senha e entrar no Painel.
11. Como Dono com várias Lojas, quero alternar a Loja ativa no Painel.
12. Como Dono, quero um checklist de onboarding, para saber o que falta para operar.
13. Como Dono, quero escolher um Slug único e válido, copiar o link e baixar o QR Code da Loja.
14. Como Dono, quero gerenciar categorias, itens, fotos, disponibilidade, Complementos e Adicionais.
15. Como Dono, quero definir horários e ativar a Pausa.
16. Como Dono, quero configurar Retirada e Delivery por bairro ou Taxa fixa (um modo).
17. Como Dono, quero informar IDs do Pixel Meta e Google, para medir meus anúncios.
18. Como Dono, quero criar Cupons promocionais e configurar o Cupom de boas-vindas.
19. Como Dono, quero convidar e remover Operadores.
20. Como Dono, quero ver Plano, faixa atual e contagem de Pedidos do mês.
21. Como Dono, quero relatórios de Pedidos por status, Fulfillment e meio de pagamento.
22. Como Dono, quero a tela Repasses (só leitura) com taxa, líquido, previsão, lotes e status pago.

### Dono e Operador
23. Quero a fila de Pedidos com polling de 10 s e som uma vez por Pedido novo.
24. Quero ver itens, escolhas, Fulfillment, pagamento e dados necessários do Pedido.
25. Quero mover o Pedido pelos estados válidos de Delivery ou Retirada e concluí-lo manualmente.
26. Quero imprimir o Pedido em layout de cupom 80 mm.
27. Quero cancelar o Pedido; PIX/Cartão pago dispara Estorno total automático e vejo seu andamento.
28. Como Operador, quero acessar só Pedidos e status das Lojas onde sou membro.

### Consumidor e Guest
29. Quero abrir a Loja por link ou QR e navegar no Cardápio pelo celular.
30. Quero personalizar itens com Complementos e Adicionais e revisar o carrinho com total.
31. Quero ver Loja fechada (com próximo horário) ou em Pausa como estados distintos, com Cardápio visível e checkout bloqueado.
32. Quero escolher Delivery (bairro atendido ou Taxa fixa) ou Retirada quando disponíveis.
33. Quero pagar por PIX com QR e copia-e-cola.
34. Quero pagar com Cartão à vista num formulário da própria Loja, informando CPF e e-mail só nesse caso.
35. Quero escolher Pagamento na entrega.
36. Quero aplicar um Cupom válido e ver o desconto recalculado.
37. Quero que retries não gerem cobrança ou Pedido duplicado.
38. Quero acompanhar o status do Pedido e abrir o WhatsApp da Loja (`wa.me`).
39. Como Guest, quero pedir só com nome e telefone (+ endereço no Delivery).
40. Como Guest, quero criar conta por magic link depois do Pedido, vincular Pedidos da mesma Loja e receber o Cupom de boas-vindas se ativo.

## Implementation Decisions

### Arquitetura e infraestrutura
- Monorepo pnpm/TypeScript: `apps/web`, `apps/admin` (Next via OpenNext), `apps/api` (Hono), `packages/db` (Drizzle + D1), `packages/shared` (regras e contratos Zod), `packages/ui`.
- O fetch público da `api` expõe só Storefront público, webhooks e `/health`; operações do Painel e do `/ops` vão por **service binding**. O navegador do Painel nunca chama a `api` direto.
- D1 único; isolamento por `packages/db` com contexto de Loja derivado do servidor; lint proíbe acesso direto ao D1 fora dele. Escritas condicionais em `batch` atômico com constraints (Pausa/horário/idempotência na mesma escrita do Pedido).
- Datas em UTC; horários de Loja em `America/Sao_Paulo`, `HH:MM`, sem overnight ([58](../../docs/decisoes/58-timezone-horarios-loja-mvp.md)). Dinheiro em centavos inteiros.
- R2 por binding para imagens (`stores/{store_id}/menu/{uuid}.{ext}`, JPEG/PNG/WebP até 5 MiB, upload só do Dono).
- Sentry (`@sentry/cloudflare`/OpenNext) e Workers Logs, sem secrets, dados de cartão, URLs com segredo ou dados pessoais desnecessários.
- Domínios: `foodedelivery.com.br`, `admin.foodedelivery.com.br`, `api.foodedelivery.com.br`. Turnstile e rate limit no checkout, login e magic link.

### Auth e permissões
- Better Auth na `api` (D1); cookie no domínio do Painel via proxy pelo binding. E-mails (convite, senha, magic link) pela MillionSend, remetente `nao-responda@foodedelivery.com.br`.
- Papéis: `foode_ops` (global, semeado por e-mail via env), `owner` e `operator` (por Loja). Usuário pode ter memberships em várias Lojas; a Loja ativa é validada no servidor a cada request.
- Operador: só Pedidos e status. Ops: só `/ops` e o que ele cadastra; não opera Pedidos.

### Loja e onboarding
- Estados `onboarding` → `active` → `suspended`; só `active` cria Pedidos (Storefront de Loja não ativa mostra Cardápio indisponível).
- Slug global, validado contra reservados e duplicados; Storefront resolve a Loja só pelo Slug.

### Pedido e checkout
- O servidor recalcula preços, escolhas, Delivery, Cupom e total. Meios: `pix`, `credit`, `on_delivery`; meio online sem taxa Foode vigente para a Loja fica indisponível.
- Pedido Guest guarda snapshot; vínculo posterior por e-mail + telefone, sem atravessar Lojas.
- Fila por polling 10 s; som uma vez por Pedido novo; conclusão manual; impressão 80 mm pelo navegador.

### Pagamentos, Ledger e repasse
- PIX AbacatePay; Crédito Normal = Efí (API de Cobranças, `payment_token`), Rápido = AbacatePay (`ctok_`). Contas únicas da Foode; `pilot_platform` para todas as Lojas.
- Cada cobrança grava provedor, modo, taxa Foode, custo do provedor e prazos. Intenções e webhooks idempotentes; eventos com identidade única; sem regressão de estado.
- Ledger: liberação no provedor → repasse previsto D+1 útil → lote diário por Loja → pago (comprovante, conta de saída, custo do envio). Estorno antes do repasse abate; depois, vira débito nos lotes seguintes.
- Reconciliação por Cron Trigger reaplica as mesmas transições dos webhooks.

### Monetização
- Mensalidade por faixa de Pedidos não cancelados do mês (iniciais R$ 84,99 / 169,99 / 254,99; anual 12× R$ 84,99), editável no `/ops`, cobrada fora do app, sem trial.
- Taxa Foode por meio/modo com vigência (padrão + override por Loja), nascendo vazia.

### Marketing
- Pixel Meta e Google por Loja (visualização, carrinho, compra), sem dados pessoais. Cupons promocionais e Cupom de boas-vindas recalculados no servidor.

### UI
- Primary `#F35050`, accent `#FFB800`, Nunito, containers outline sem fill e sem shadow ([FOODE-BRAND](../../docs/FOODE-BRAND.md)); `docs/DESIGN.md` só para densidade/spacing. Mobile-first no Storefront.

## Testing Decisions

- Testes verificam comportamento externo, contratos HTTP/RPC, autorização, estado persistido e efeitos financeiros.
- **Seam 1 — rotas com D1:** `@cloudflare/vitest-pool-workers` (workerd + D1 SQLite) **só no CI**; cobre Loja, onboarding, Cardápio, checkout, Pausa, Delivery, Cupom, Pedido, estados, cancelamento, RBAC (Ops/Dono/Operador) e **isolamento entre duas Lojas**, inclusive por id adivinhado.
- **Seam 2 — webhooks e reconciliação:** endpoints AbacatePay e Efí e o handler `scheduled` com adapters fakes no limite HTTP: assinatura inválida, duplicata, reentrega, fora de ordem, Estorno, Ledger, lote.
- **Seam 3 — unitários:** dinheiro, taxa Foode por vigência, Ledger/datas úteis, faixas, Cupom, parsers dos providers.
- Migrations provadas num D1 remoto efêmero no CI; smoke em produção após cada deploy. Pre-push local roda só testes sem banco. Nunca banco local nem Docker.

## Out of Scope

- Robô/automação de WhatsApp, recuperador de vendas, PDV/balcão, mesas/garçom, KDS, NF, cashback, fidelidade por N pedidos, integração iFood, agendamento de Pedido, app nativo, marketplace/diretório.
- Conta de provedor por Loja, split, Pix automático de repasse, antecipação com caixa da Foode, parcelamento, boleto, kill switch de provedor, BaaS.
- Teste grátis, cobrança self-serve da Mensalidade, overage automático.
- Taxa de Delivery por km, frota/entregadores, domínio próprio por Loja, Workspace.
- WebSocket/SSE, staging, preview, banco local, Docker, Redis/filas externas.
- Débito online e carteiras, **salvo** se o Ticket 27 comprovar suporte no checkout transparente dos provedores.
