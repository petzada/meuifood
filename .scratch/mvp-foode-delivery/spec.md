# MVP Foode Delivery

Status: ready-for-agent

> **Versão 3 — 2026-11-05.** Incorpora as decisões de UX do benchmark Anota ([63](../../docs/decisoes/63-decisoes-ux-benchmark-anota.md)), a revisão adversarial de escopo ([64](../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)), o login do Consumidor por código no WhatsApp ([65](../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md)) e os esclarecimentos da consolidação ([66](../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md)) sobre a v2 (pivô: infraestrutura Cloudflare [59](../../docs/decisoes/59-pivo-cloudflare-d1-workers.md)/[ADR 0006](../../docs/adr/0006-cloudflare-workers-d1-sem-rls.md), pagamentos AbacatePay/Efí [60](../../docs/decisoes/60-pagamentos-efi-abacatepay.md)/[ADR 0007](../../docs/adr/0007-efi-abacatepay-provedor-fixo-por-loja.md), monetização [61](../../docs/decisoes/61-monetizacao-faixas-taxas-anota.md), Ops/multi-Loja [62](../../docs/decisoes/62-escopo-ops-multiloja-funcionalidades.md)). Em conflito, a decisão mais nova vence (66 > 65 > 64 > 63 > 59–62); v1 e v2 estão no histórico do git.

## Problem Statement

O Comerciante de uma PME que já opera delivery quer reduzir dependência e custo de marketplaces. Ele já traz o Consumidor por WhatsApp, Instagram, QR Code e recorrência, mas precisa de um Canal próprio com Cardápio, checkout, pagamento online e gestão de Pedidos, com custo previsível e sem comissão.

O Dono configura a Loja e acompanha operação e finanças. O Operador trabalha com Pedidos, status e Pausa. O Consumidor pede pelo navegador do celular, sem app e sem conta obrigatória. A equipe Foode (Ops) precisa cadastrar Lojas, definir condições comerciais e repassar o dinheiro recebido em custódia, tudo pela interface.

## Solution

SaaS web mobile-first de Canal próprio, 100% na Cloudflare: Storefront (`web`), Painel (`admin`, inclui `/ops`) e API (`api`) como Workers, D1 como banco. Cada Loja é um tenant isolado por `store_id`, com Slug global e Storefront em `/loja/[slug]`. Um usuário do Painel pode pertencer a várias Lojas; o Consumidor tem uma conta única na Foode com dados separados por Loja.

O Ops cria a Loja com dados, Plano, faixas, taxas e modo do cartão e convida o Dono, que responde duas perguntas de perfil, completa o onboarding (vitrine, Slug, contato, horários, Delivery/Retirada, Cardápio, Pixel) e divulga link e QR Code. Só Loja `active` recebe Pedidos.

O Consumidor busca no Cardápio, vê Destaques, monta o carrinho, escolhe Delivery ou Retirada e paga por PIX (AbacatePay), Cartão de crédito à vista (Efí no modo Normal ou AbacatePay no Rápido) ou Pagamento na entrega (com troco), podendo aplicar Cupom. Pode pedir como Guest ou entrar com código de 4 dígitos no WhatsApp. O Painel opera a fila por polling de 10 s com som e chips por Fulfillment, imprime Pedidos (inclusive ao aceitar), avisa o Consumidor pelo WhatsApp e cancela com Estorno automático.

O dinheiro online entra nas contas únicas da Foode (`pilot_platform`). O Ledger interno calcula taxa Foode, líquido e repasse D+1 útil após a liberação no provedor; o Ops paga lotes diários por Loja e marca como pagos. A Foode cobra Mensalidade por faixa de Pedidos (fora do app) e taxa Foode por meio de pagamento.

## User Stories

### Ops Foode
1. Como Ops, quero entrar no `/ops` com papel `foode_ops`, para operar a plataforma sem scripts.
2. Como Ops, quero cadastrar uma Loja com nome, CNPJ, Slug inicial, WhatsApp, endereço (com CEP que preenche o endereço), chave Pix e titular de repasse, para ela existir em `onboarding`.
3. Como Ops, quero convidar o Dono por e-mail, para ele concluir o onboarding.
4. Como Ops, quero definir Plano (mensal/anual), editar as faixas e ativar ou suspender a Loja, para controlar quem recebe Pedidos.
5. Como Ops, quero definir o modo do cartão (Normal/Rápido) da Loja conforme o contrato.
6. Como Ops, quero manter tabelas padrão de taxa Foode e overrides por Loja com vigência, para precificar sem deploy.
7. Como Ops, quero manter a tabela de custos dos provedores e ver a margem por Loja, para acompanhar a rentabilidade.
8. Como Ops, quero ver todo dia útil o lote "a repassar hoje" por Loja, pagar por fora e marcar como pago com comprovante e custo do envio.
9. Como Ops, quero que toda ação no `/ops` fique auditada.
10. Como Ops, quero ler as respostas de perfil (culinária e objetivo) de cada Loja.
11. Como Ops, quero trocar o telefone de uma conta de Consumidor, com auditoria, quando houver conflito.

### Dono
12. Como Dono, quero aceitar o convite, definir senha e entrar no Painel.
13. Como Dono, quero responder duas perguntas de perfil no primeiro acesso, sabendo que são para uso interno da Foode.
14. Como Dono com várias Lojas, quero alternar a Loja ativa no Painel.
15. Como Dono, quero um checklist de onboarding, para saber o que falta para operar.
16. Como Dono, quero cadastrar logo quadrado, imagem de capa e descrição curta (até 160 caracteres) da Loja.
17. Como Dono, quero escolher um Slug único e válido, copiar o link e baixar o QR Code da Loja.
18. Como Dono, quero gerenciar categorias, itens, fotos, disponibilidade, preço inline, Complementos (com preço opcional por opção, copiando grupos de outro item) e Adicionais.
19. Como Dono, quero marcar até 4 itens como Destaques.
20. Como Dono, quero definir horários e ativar a Pausa.
21. Como Dono, quero configurar Retirada e Delivery por bairro (com bairros ativos/inativos) ou Taxa fixa, pedido mínimo do Delivery e tempo estimado por Fulfillment.
22. Como Dono, quero escolher as bandeiras aceitas na maquininha (Débito e Crédito) e ligar "Imprimir ao aceitar".
23. Como Dono, quero informar IDs do Pixel Meta e Google, para medir meus anúncios.
24. Como Dono, quero criar Cupons promocionais (com teto em %, dias da semana e modelos) e configurar o Cupom de boas-vindas.
25. Como Dono, quero convidar e remover Operadores.
26. Como Dono, quero ver Plano, faixa atual e contagem de Pedidos do mês.
27. Como Dono, quero relatórios por status, Fulfillment e meio, com comparativo ao período anterior, top 10 itens por dia da semana, TOP 10 clientes com conta, funil de conversão próprio, exportação CSV e impressão.
28. Como Dono, quero a tela Repasses (só leitura) com taxa, líquido, previsão, lotes e status pago.
29. Como Dono, quero ser avisado no Painel quando um Operador ativar a Pausa.

### Dono e Operador
30. Quero a fila de Pedidos com polling de 10 s, som uma vez por Pedido novo e chips "Todos / Delivery / Retirada".
31. Quero um tour de 3 passos na primeira visita à fila, pulável.
32. Quero ver itens, escolhas, observação geral, Fulfillment, pagamento, troco e dados necessários do Pedido.
33. Quero mover o Pedido pelos estados válidos de Delivery ou Retirada e concluí-lo manualmente.
34. Quero imprimir o Pedido em layout de cupom 80 mm (e, se a Loja ligou, ao aceitar).
35. Quero "Avisar no WhatsApp" o Consumidor com texto fixo por status e link de acompanhamento.
36. Quero cancelar o Pedido com motivo opcional; PIX/Cartão pago dispara Estorno total automático e vejo seu andamento.
37. Como Operador, quero acessar Pedidos, status e Pausa das Lojas onde sou membro.

### Consumidor e Guest
38. Quero abrir a Loja por link ou QR, ver logo, capa, descrição e Destaques, buscar itens e navegar no Cardápio pelo celular.
39. Quero abrir "Sobre a Loja" (horários, endereço quando há Retirada, meios aceitos, pedido mínimo, tempo estimado).
40. Quero compartilhar a Loja e um item.
41. Quero personalizar itens com Complementos e Adicionais e revisar o carrinho com total.
42. Quero ver Loja fechada (com próximo horário) ou em Pausa como estados distintos, com Cardápio visível e checkout bloqueado.
43. Quero escolher Delivery (bairro atendido ou Taxa fixa) ou Retirada quando disponíveis, informar CEP para preencher o endereço e ver quanto falta para o pedido mínimo.
44. Quero que, ao digitar meu telefone, a Loja me ofereça meus dados mascarados para eu confirmar, e que o aparelho lembre meus dados se eu quiser.
45. Quero pagar por PIX com QR e copia-e-cola.
46. Quero pagar com Cartão à vista num formulário da própria Loja, informando CPF e e-mail só nesse caso.
47. Quero escolher Pagamento na entrega, ver as bandeiras aceitas e informar troco.
48. Quero deixar uma observação geral no Pedido (até 200 caracteres).
49. Quero aplicar um Cupom válido por código e ver o desconto recalculado.
50. Quero que retries não gerem cobrança ou Pedido duplicado.
51. Quero ver o aviso de Privacidade e o selo "Ambiente seguro" antes de pedir.
52. Quero acompanhar o status e o tempo estimado do Pedido e abrir o WhatsApp da Loja (`wa.me`).
53. Como Guest, quero pedir só com nome e telefone (+ endereço no Delivery).
54. Como Consumidor, quero entrar com um código de 4 dígitos recebido no WhatsApp, criar minha conta única na Foode com nome e CPF, ver meus Pedidos daquela Loja feitos com o mesmo telefone e receber o Cupom de boas-vindas da Loja se o programa estiver ativo e eu ainda não tiver Pedido nela.

## Implementation Decisions

### Arquitetura e infraestrutura
- Monorepo pnpm/TypeScript: `apps/web`, `apps/admin` (Next via OpenNext), `apps/api` (Hono), `packages/db` (Drizzle + D1), `packages/shared` (regras e contratos Zod), `packages/ui`.
- O fetch público da `api` expõe só Storefront público (Cardápio, checkout, página do Pedido, busca por telefone, login e conta do Consumidor), webhooks e `/health`; operações do Painel e do `/ops` vão por **service binding**. O navegador do Painel nunca chama a `api` direto.
- D1 único; isolamento por `packages/db` com contexto de Loja derivado do servidor; lint proíbe acesso direto ao D1 fora dele. Escritas condicionais em `batch` atômico com constraints (Pausa/horário/idempotência na mesma escrita do Pedido).
- Datas em UTC; horários de Loja em `America/Sao_Paulo`, `HH:MM`, sem overnight ([58](../../docs/decisoes/58-timezone-horarios-loja-mvp.md)). Dinheiro em centavos inteiros.
- R2 pelo binding `MEDIA` para imagens do Cardápio e da Loja (logo, capa): o `admin` envia os bytes pela RPC do service binding (só Dono), a `api` confere JPEG/PNG/WebP ≤ 5 MiB e grava em `stores/{store_id}/…`; leitura pública por rota da `api` ou domínio público do bucket. Sem URL pré-assinada nem credenciais S3 ([64](../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md)).
- Sentry (`@sentry/cloudflare`/OpenNext) e Workers Logs, sem secrets, dados de cartão, URLs com segredo, telefone, CPF, e-mail ou endereço.
- Domínios: `foodedelivery.com.br`, `admin.foodedelivery.com.br`, `api.foodedelivery.com.br`. Turnstile e rate limit no checkout, na busca por telefone, no login do Consumidor e no login/convite/reset do Painel.

### Auth e permissões
- **Painel:** Better Auth na `api` (D1), e-mail e senha, sem cadastro aberto; cookie no domínio do Painel via proxy pelo binding. E-mails (convite, definição e reset de senha) pela MillionSend, remetente `nao-responda@foodedelivery.com.br`.
- Papéis: `foode_ops` (global, semeado por e-mail via env), `owner` e `operator` (por Loja). Usuário pode ter memberships em várias Lojas; a Loja ativa é validada no servidor a cada request.
- Operador: Pedidos, status e **Pausa** (ativar e retomar, auditado, Dono avisado — P-OPE-4); sem horários, entrega, Cardápio, Cupons, relatórios, Plano ou equipe. Ops: só `/ops` e o que ele cadastra; não opera Pedidos.
- **Consumidor ([65](../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md)):** entra **só** por código no WhatsApp, enviado pela API **whatsmiau.dev** do número oficial da Foode com a mensagem `XXXX é o seu código de acesso ao Foode Delivery.`. Código de 4 dígitos, 5 min, 5 tentativas, reenvio após 30 s, hash e uso único; rate limit por telefone e IP + Turnstile. Sem magic link por e-mail.
- Conta única na Foode, dados por Loja: o mesmo login vale em qualquer Loja; Pedidos, Cupom de boas-vindas e histórico ficam separados por Loja. **CPF obrigatório e único** na criação da conta (nome + CPF após o primeiro código); um telefone = uma conta, um CPF = uma conta; conflito bloqueia e, com o widget de suporte ativo no Storefront, orienta "Fale com o suporte Foode pelo chat" (com o widget desligado não há canal: risco aceito na [66](../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md)); troca de número só pelo Ops, auditada. Sem vários endereços salvos.
- Até o passo humano da whatsmiau (fim da implementação), o login do Consumidor responde "Login pelo WhatsApp indisponível no momento" e o checkout Guest segue funcionando.

### Loja e onboarding
- Estados `onboarding` → `active` → `suspended`; só `active` cria Pedidos (Storefront de Loja não ativa mostra Cardápio indisponível).
- Slug global, validado contra reservados e duplicados; Storefront resolve a Loja só pelo Slug.
- Primeiro acesso do Dono: duas perguntas de perfil (culinária e objetivo), gravadas para uso interno da Foode e lidas no `/ops`. Checklist sem ordem forçada. O próprio Dono cadastra o Cardápio (sem itens fictícios); sem Pedido de teste antes de abrir a Loja.
- Vitrine: logo quadrado, imagem de capa (sem cor personalizada), descrição até 160 caracteres (também meta description). Endereço da Loja com CEP opcional que preenche o endereço (Ops e Dono).

### Storefront
- Cabeçalho com logo, capa, nome, estado de funcionamento, compartilhar (Web Share + copiar link) e sheet **Sobre a Loja** (horários, endereço só com Retirada ativa, meios aceitos e bandeiras, pedido mínimo, tempo estimado, descrição).
- **Destaques:** até 4 itens marcados pelo Dono, em carrossel no topo. **Busca** de itens filtrada no navegador. Item com URL própria e compartilhar.
- Opção de Complemento com preço opcional (padrão 0); o máximo do grupo vale também para opções pagas, e extra pago sem limite é Adicional (ex.: "Molho extra"). Sem meio a meio (pizzaria usa grupo "Sabores" com até 2 opções), sem preço "de/por", sem observação por item, sem classificações, sem barra inferior de abas, sem tema escuro, sem vitrine de Cupons.

### Pedido e checkout
- Checkout numa tela só: Seus dados → Como receber → Endereço → Pagamento → Cupom → Observações → Resumo → "Fazer pedido".
- **Busca de dados pelo telefone, escopo da Loja (P-2.1):** só Pedidos da mesma Loja; resposta mascarada (primeiro nome e rua sem número); dados completos só depois que o Consumidor confirma "Sou eu"; rate limit por IP, Turnstile e auditoria; sem código. "Lembrar meus dados neste aparelho" marcado por padrão (`localStorage` por Loja) com "Esquecer meus dados".
- **CEP opcional** preenche rua e bairro (ViaCEP/BrasilAPI, falha silenciosa); o bairro continua escolhido da lista da Loja; sem geolocalização.
- **Pedido mínimo** opcional só no Delivery, conferido no servidor, com "Faltam R$ X". **Tempo estimado** mín–máx por Fulfillment, opcional, no Storefront e na página do Pedido.
- O servidor recalcula preços, escolhas, Delivery, mínimo, troco, Cupom e total. Meios: `pix`, `credit`, `on_delivery` (único, sem subtipo), em opções neutras sem incentivo ao PIX; meio online sem taxa Foode vigente para a Loja fica indisponível. **Troco para** opcional, validado ≥ total. Bandeiras da maquininha (Débito/Crédito) exibidas quando configuradas.
- Observação geral do Pedido até 200 caracteres (Painel e impressão). Aviso com link para a Política de Privacidade (página estática) e selo "Ambiente seguro" antes de "Fazer pedido".
- Pedido Guest guarda snapshot; vínculo posterior pelo **telefone verificado na mesma Loja** (sem e-mail), sem atravessar Lojas. Pedido autenticado nasce ligado à conta.
- Fila por polling 10 s; som uma vez por Pedido novo; chips "Todos / Delivery / Retirada", sem busca; sem aceite automático e sem "Concluir" em lote; conclusão manual; tour de 3 passos na primeira visita (Pedido fictício só na tela).
- Impressão 80 mm pelo navegador com rodapé fixo; configuração da Loja "Imprimir ao aceitar" (ligada, aceitar abre a impressão). "Avisar no WhatsApp" (`wa.me`) por Pedido, texto fixo por status com link de acompanhamento. Motivo de cancelamento opcional (lista curta). Nenhum atalho de Pedido por telefone.

### Pagamentos, Ledger e repasse
- PIX AbacatePay; Crédito Normal = Efí (API de Cobranças, `payment_token`), Rápido = AbacatePay (`ctok_`). Contas únicas da Foode; `pilot_platform` para todas as Lojas. Sem carteiras digitais; débito online só se o Ticket 27 comprovar suporte.
- Cada cobrança grava provedor, modo, taxa Foode, custo do provedor e prazos. Intenções e webhooks idempotentes; eventos com identidade única; sem regressão de estado.
- Ledger: liberação no provedor → repasse previsto D+1 útil → lote diário por Loja → pago (comprovante, conta de saída, custo do envio). Estorno antes do repasse abate; depois, vira débito nos lotes seguintes.
- Reconciliação por Cron Trigger reaplica as mesmas transições dos webhooks.

### Monetização
- Mensalidade por faixa de Pedidos não cancelados do mês (iniciais R$ 84,99 / 169,99 / 254,99; anual 12× R$ 84,99), editável no `/ops`, cobrada fora do app, sem trial. Progresso da faixa só na tela Plano.
- Taxa Foode por meio/modo com vigência (padrão + override por Loja), nascendo vazia.

### Marketing e relatórios
- Pixel Meta e Google por Loja (visualização, carrinho, compra), sem dados pessoais; apoio às campanhas do lojista, não fonte do funil Foode.
- **Funil de conversão próprio** (visita → item → carrinho → checkout → Pedido), eventos agregados por Loja sem dado pessoal.
- Cupons promocionais (código, % ou R$, teto opcional no %, validade, dias da semana D S T Q Q S S, limite de usos, pedido mínimo, ativo/inativo, 2–3 modelos que preenchem o formulário) e Cupom de boas-vindas de primeira compra por Loja (só para conta sem nenhum Pedido na Loja, Guest vinculado incluído; uso único por conta por Loja), recalculados no servidor; sem Cupom de frete; só por código.
- Relatórios: números do topo com comparativo ao período anterior; top 10 itens com quebra por dia da semana; **TOP 10 clientes** por valor só com conta na Foode (nunca Guest), só nome e totais, sem exportação; exportação **CSV** (UTF-8 com BOM, sem telefone/endereço) e **impressão** pelo navegador (CSS de impressão); sem PDF/XLSX no servidor.

### Suporte
- Espaço do **widget de chat de suporte** (chatbot automatizado) no Painel **e no Storefront**, desligado sem configuração, com a mesma base de integração; atende também o Consumidor bloqueado por conflito de conta, com ponto de montagem, contrato de configuração e documento de integração para o agente do agentes.chat + MCP (implementação pós-lançamento). Sem link `wa.me` de suporte.

### UI
- Primary `#F35050`, accent `#FFB800`, Nunito, containers outline sem fill e sem shadow ([FOODE-BRAND](../../docs/FOODE-BRAND.md)); `docs/DESIGN.md` só para densidade/spacing. Mobile-first no Storefront.
- Token `--color-primary-strong` (≈ `#D63A3A`, ≥ 4,5:1) para fundos com texto e links; `#F35050` segue em bordas, ícones, foco e marca.
- Cada tela segue as [DIRETRIZES-UX-CLIENTE](../../docs/referencias/anota-ai/DIRETRIZES-UX-CLIENTE.md) e [DIRETRIZES-UX-LOJISTA](../../docs/referencias/anota-ai/DIRETRIZES-UX-LOJISTA.md) onde não conflitam com as decisões; os critérios do antigo Ticket 20 são itens do `/code-review` de cada ticket de UI.

## Testing Decisions

- Testes verificam comportamento externo, contratos HTTP/RPC, autorização, estado persistido e efeitos financeiros.
- **Seam 1 — rotas com D1:** `@cloudflare/vitest-plugin` (workerd + D1 do Miniflare) **só no CI**; cobre Loja, onboarding, Cardápio, checkout, busca por telefone, login do Consumidor, Pausa (Dono e Operador), Delivery, Cupom, Pedido, estados, cancelamento, RBAC (Ops/Dono/Operador) e **isolamento entre duas Lojas**, inclusive por id adivinhado.
- **Seam 2 — webhooks e reconciliação:** endpoints AbacatePay e Efí e o handler `scheduled` com adapters fakes no limite HTTP: assinatura inválida, duplicata, reentrega, fora de ordem, Estorno, Ledger, lote. whatsmiau.dev também fake no limite HTTP.
- **Seam 3 — unitários:** dinheiro, taxa Foode por vigência, Ledger/datas úteis, faixas, Cupom (teto, dias da semana), código de acesso, CPF, parsers dos providers.
- Migrations provadas num D1 remoto efêmero no CI; smoke em produção após cada deploy. Pre-push local roda só testes sem banco. Nunca banco local nem Docker.

## Out of Scope

- Robô/automação de WhatsApp (o envio do código de acesso pela whatsmiau.dev é a única mensagem automática), recuperador de vendas, PDV/balcão e qualquer atalho de Pedido por telefone, mesas/garçom, KDS, NF, cashback, fidelidade por N pedidos, integração iFood, agendamento de Pedido, app nativo, marketplace/diretório.
- Conta de provedor por Loja, split, Pix automático de repasse, antecipação com caixa da Foode, parcelamento, boleto, kill switch de provedor, BaaS, carteiras digitais.
- Teste grátis, cobrança self-serve da Mensalidade, overage automático.
- Taxa de Delivery por km, "usar minha localização", frota/entregadores, domínio próprio por Loja, Workspace.
- Magic link por e-mail e senha para Consumidor; vários endereços salvos na conta; vitrine de Cupons; Cupom de frete.
- Meio a meio, preço "de/por", observação por item, classificações de item, edição em massa, grupos de Complemento compartilhados.
- Aceite automático, "Concluir" em lote, busca na fila, campos personalizáveis no cupom impresso, configuração de impressora.
- Pedido de teste antes de abrir a Loja, itens fictícios no Cardápio, cor personalizada da Loja, tema escuro, barra inferior de abas, incentivo ao PIX.
- PDF/XLSX gerados no servidor, exportação do TOP 10 clientes, Guest no TOP 10.
- Link `wa.me` de suporte; agente do agentes.chat e MCP (pós-lançamento; só o espaço do widget entra).
- WebSocket/SSE, staging, preview, banco local, Docker, Redis/filas externas.
- Débito online, **salvo** se o Ticket 27 comprovar suporte no checkout transparente dos provedores.
