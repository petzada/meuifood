# Foode Delivery

SaaS web mobile-first de canal próprio (cardápio + pedidos + gestão) para PME de delivery local. A loja traz o consumidor; a plataforma cobra Mensalidade por faixa de Pedidos e taxas de pagamento online, sem comissão de marketplace.

## Language

### Atores

**Comerciante**:
Pessoa ou empresa (CNPJ) que é o cliente pagante do SaaS — dono do estabelecimento.
_Avoid_: Cliente (ambíguo), merchant (só em código de gateway), conta SaaS

**Dono**:
Papel do comerciante no painel: acesso total (config, cardápio, pedidos, pagamentos, relatórios, plano).
_Avoid_: Admin genérico, owner (salvo campo técnico `owner`)

**Operador**:
Funcionário da loja com acesso a pedidos/status e à **Pausa** (ativa e retoma, com auditoria e aviso ao Dono — decisão 63, P-OPE-4); sem cardápio, horários, frete, relatórios, plano, equipe ou fidelidade.
_Avoid_: Atendente, colaborador, staff (salvo UI)

**Consumidor**:
Pessoa que pede pelo link/QR da loja (guest ou com conta).
_Avoid_: Cliente final, usuário (salvo auth), comprador

**Ops Foode**:
Pessoa da equipe Foode com papel global `foode_ops`: cadastra Lojas, convida Donos, define Plano, faixas, taxas e modo do cartão, e opera os lotes de repasse na área `/ops` do Painel.
_Avoid_: Admin (ambíguo com Painel), suporte, superusuário

**Guest**:
Consumidor que conclui pedido sem conta; dados mínimos gravados no pedido.
_Avoid_: Anônimo, visitante

**Conta do Consumidor**:
Conta única na Foode, criada após o primeiro Código de acesso com nome + CPF (obrigatório e único); um telefone = uma conta. Vale em qualquer Loja, mas Pedidos, Cupom de boas-vindas e histórico ficam separados por Loja; Pedidos Guest da mesma Loja com o telefone verificado entram na conta ([65](docs/decisoes/65-login-consumidor-codigo-whatsapp.md)).
_Avoid_: Cadastro por Loja, login por e-mail/magic link, conta do Painel

**Código de acesso**:
Código de 4 dígitos enviado ao WhatsApp do Consumidor pela whatsmiau.dev ("XXXX é o seu código de acesso ao Foode Delivery."), válido por 5 min, com 5 tentativas e uso único; único meio de login do Consumidor.
_Avoid_: Magic link, senha do Consumidor, OTP por SMS

### Tenant e loja

**Loja**:
Unidade operacional e tenant de dados: um CNPJ, um slug, um cardápio. Isolamento multi-tenant via `store_id`. Estados: `onboarding` → `active` (só esta recebe Pedidos) → `suspended`. Um usuário pode ser membro de várias Lojas e escolhe a Loja no Painel.
_Avoid_: Workspace, unidade, estabelecimento (salvo copy), merchant como tenant

**Slug**:
Identificador único global da loja na URL `/loja/[slug]`.
_Avoid_: Subdomínio, username

**Workspace**:
Conceito de multi-unidade sob um comerciante — **fora do MVP**.
_Avoid_: Usar no schema ou código do MVP

### Canal e pedido

**Canal próprio**:
Cardápio e checkout web da loja (link/QR), sem praça multi-loja nem take-rate de marketplace.
_Avoid_: Marketplace, vitrine, app da plataforma

**Cardápio**:
Catálogo da loja: categorias, itens, fotos, disponibilidade, complementos e adicionais.
_Avoid_: Menu (salvo UI), catálogo genérico

**Complemento**:
Opção configurável pelo comerciante no item (ex.: ponto da carne, escolha obrigatória/opcional).
_Avoid_: Extra (ambíguo), variante

**Adicional**:
Acréscimo com preço configurável no item.
_Avoid_: Extra pago (salvo copy)

**Destaque**:
Item do Cardápio marcado pelo Dono (no máximo 4 por Loja) e exibido em carrossel no topo do Storefront.
_Avoid_: Promoção, vitrine, mais vendido (é métrica de relatório)

**Pedido**:
Pedido do consumidor na loja: itens, fulfillment, pagamento e status no painel.
_Avoid_: Order (salvo código), comanda

**Pedido mínimo**:
Valor mínimo opcional, só para Delivery, conferido no servidor sobre o subtotal dos itens; o Storefront mostra "Faltam R$ X".
_Avoid_: Valor mínimo de entrega (salvo copy), taxa de pedido pequeno

**Tempo estimado**:
Intervalo mín–máx opcional por Fulfillment (Delivery e Retirada), configurado pelo Dono e exibido ao Consumidor; informativo, sem SLA.
_Avoid_: Prazo garantido, contagem regressiva

**Troco para**:
Valor opcional informado pelo Consumidor no Pagamento na entrega, validado ≥ total, mostrado no Painel e na impressão.
_Avoid_: Subtipo de pagamento (o meio continua `on_delivery`)

**Fulfillment**:
Como o pedido chega ao consumidor: delivery ou retirada no balcão (se a loja ativar).
_Avoid_: Modalidade de entrega (salvo copy longa), shipping

**Delivery**:
Entrega no endereço do consumidor; taxa por **bairro** ou **taxa fixa** (um modo por loja). Km/raio = pós-MVP.
_Avoid_: Frete (salvo copy), shipping

**Retirada**:
Consumidor busca no balcão; opcional por loja.
_Avoid_: Pickup (salvo código), balcão-only

### Pagamento e receita

**Faixa (de Pedidos)**:
Intervalo de quantidade de Pedidos não cancelados do Canal próprio no mês civil que define o valor da Mensalidade mensal.
_Avoid_: Tier de GMV, limite de pedidos

**GMV**:
Soma do total pago pelo consumidor em pedidos **Concluídos** no mês (itens + adicionais + taxa de delivery), só em meios **online** (PIX, crédito, débito, voucher). Exclui pagamento na entrega e cancelados. Usado só em relatórios.
_Avoid_: Receita da plataforma, faturamento do CNPJ fora do canal, GMV de marketplace, GMV com maquininha na entrega

**Mensalidade**:
Assinatura SaaS por **faixa de Pedidos do mês** (valores no `/ops`; iniciais R$ 84,99 / 169,99 / 254,99) ou anual com preço fixo e Pedidos ilimitados. Cobrada fora do app; o Ops ativa o Plano.
_Avoid_: R$ 179 fixo, teto de GMV, comissão, trial

**Plano (assinatura Foode)**:
Produto comercial contratado pela loja (mensal ou anual). No MVP: tela no Painel com faixa atual e contagem do mês + ativação pelo Ops; cobrança self-serve = pós-MVP.
_Avoid_: Overage automático, bloqueio por faixa

**Taxa de pagamento**:
MDR cobrado do comerciante no PIX/crédito/débito/voucher online (markup de gateway), distinto de mensalidade e de comissão de marketplace.
_Avoid_: Comissão, take-rate (salvo conversa de marketplace)

**PIX**:
Pagamento online via **AbacatePay** (QR dinâmico + copia-e-cola); taxa Foode da Loja cadastrada no `/ops`.
_Avoid_: OpenPix (marca legacy), boleto

**Crédito online**:
Pagamento online **à vista** por checkout transparente, no **Modo do cartão** da Loja: Normal (Efí, liberação em até 21 dias úteis) ou Rápido (AbacatePay, até 1 dia útil); o lojista paga a Taxa Foode vigente do meio/modo, cadastrada no `/ops`, e recebe o repasse D+1 útil após a liberação (decisões 60 e 61).
_Avoid_: Maquininha (isso é na entrega)

**Débito online**:
Pagamento online com cartão de débito. **Fora do MVP, salvo** se o Ticket 27 comprovar suporte no checkout transparente da Efí ou da AbacatePay (decisão 60); nesse caso ganha ticket próprio.
_Avoid_: Débito na maquininha do lojista

**Voucher online**:
Pagamento online / vale (provedor e taxa futuros). **Fora do MVP.**
_Avoid_: Cupom de fidelidade Foode (é outro conceito)

**Modo do cartão**:
Condição contratada pela Loja e configurada pelo Ops: **Normal** (Efí, taxa menor, ~21 dias úteis) ou **Rápido** (AbacatePay, taxa maior, D+1). Define o provedor do Crédito; não há troca automática.
_Avoid_: Kill switch, fallback automático, escolha do Consumidor, antecipação

**Taxa Foode**:
Taxa de pagamento cobrada do lojista por meio/modo (% + fixo), com vigência, definida no `/ops` (padrão + override por Loja). Meio sem taxa vigente fica fora do checkout. Diferente do custo do provedor, que só o Ops vê.
_Avoid_: Taxa da Efí/AbacatePay (para o lojista), MDR do provedor

**Pagamento na entrega**:
Consumidor paga fora da plataforma (maquininha/dinheiro do lojista); sem take da Foode e **fora do GMV**.
_Avoid_: COD genérico sem contexto

**Modo de cobrança**:
Config da loja que define custódia: só existe `pilot_platform` (dinheiro nas contas únicas Efí/AbacatePay da Foode, repasse manual via Ledger) e vale para todas as Lojas. O modo de escala pós-piloto é decisão aberta; `baas` e `merchant_own_account` estão arquivados ([60](docs/decisoes/60-pagamentos-efi-abacatepay.md)).
_Avoid_: Gateway mode genérico, split, BaaS como caminho decidido

**Tomadora BaaS**:
_(Arquivado em 2026-11-04 — histórico da trilha Asaas; não usar em código novo.)_
PJ da Foode (alvo: **LTDA** pós-piloto) que orquestra subcontas/split Asaas para comerciantes; não é instituição autorizada pelo Bacen.
_Avoid_: White label (termo legado), Foode como “banco”, MEI como Tomadora de escala

**Prestadora BaaS**:
_(Arquivado em 2026-11-04 — histórico da trilha Asaas; não usar em código novo.)_
Instituição autorizada que processa/custodia — no arranjo Foode, o **Asaas** (marca obrigatória em onboarding/comprovantes).
_Avoid_: Gateway genérico, PSP sem distinguir do papel Bacen

**Homologação BaaS**:
_(Arquivado em 2026-11-04 — histórico da trilha Asaas; não usar em código novo.)_
Liberação comercial/compliance com gerente Asaas (playbook marca, docs, Res. Conjunta 16/17) para operar subcontas sem o teto do período de avaliação.
_Avoid_: “Ativar subcontas” sem homologação, sandbox como equivalente

**Piloto validado**:
Julgamento manual do founder de que o comerciante-modelo opera a plataforma de ponta a ponta; gatilho para abrir a LTDA. Sem métrica mínima escrita (GMV/N pedidos).
_Avoid_: Go/no-go automático, “4 semanas = validado” como regra

**Comerciante-modelo**:
_(Superseded em 2026-11-04: toda Loja criada pelo Ops é tratada como cliente real; não há Loja única de piloto.)_
_Avoid_: “Primeiro cliente” ambíguo, beta multi-loja

**Onboarding de subconta**:
_(Arquivado em 2026-11-04 — histórico da trilha Asaas; não usar em código novo.)_
Fluxo no `admin` (pós-BaaS) para criar/acompanhar subconta Asaas do comerciante (`apiKey`, `walletId`, docs); ativação assistida pela Foode — modelo único pós-validação.
_Avoid_: Self-serve aberto pré-homologação, script-only como único caminho, custódia MEI eterna

**Ledger de repasse**:
Registro pedido ↔ cobrança ↔ provedor ↔ taxa Foode ↔ líquido ↔ liberação no provedor ↔ repasse previsto (D+1 útil) ↔ lote pago. Para o Dono é a tela **Repasses** (só leitura).
_Avoid_: Extrato bancário, settlement genérico

**Lote de repasse**:
Conjunto diário, por Loja, dos lançamentos com repasse previsto até hoje; o Ops paga um Pix por fora e marca o lote como pago (conta de saída, comprovante, custo do envio).
_Avoid_: Saque, transferência automática, split

### Apps e superfície

**Storefront (`web`)**:
App Next público: marketing (se couber) + `/loja/[slug]` (cardápio/checkout). Visual: primary Foode, containers outline.
_Avoid_: Front, site da loja (ambíguo com site do comerciante)

**Painel (`admin`)**:
App Next do lojista: pedidos, cardápio, configs, equipe, UI de plano. Mesma linguagem visual outline + primary Foode.
_Avoid_: Dashboard genérico, backoffice

**API (`api`)**:
Worker Cloudflare em Hono: domínio, webhooks, Cron Triggers; fonte de verdade de pedidos/pagamentos. O Painel a chama por service binding.
_Avoid_: BFF (salvo exceção fina), serverless routes de produção no Next

**Primary Foode**:
Cor de marca `#F35050` extraída do logo oficial; CTAs e ênfase brand.
_Avoid_: Rausch Airbnb, purple AI-default

**Container outline**:
Bloco de conteúdo com borda fina, sem fill, sem shadow, cantos arredondados.
_Avoid_: Card com fill+sombra como default

### Medição

**Funil de conversão**:
Contagem própria da Foode, agregada por Loja e sem dado pessoal, das etapas visita → item → carrinho → checkout → Pedido no Storefront; base do relatório do Dono. O Pixel Meta/Google é apoio às campanhas do lojista, não fonte do funil.
_Avoid_: Funil do Pixel, analytics por Consumidor, rastreamento individual

### Fidelidade

**Cupom promocional**:
Código criado pelo Dono: % ou R$, validade, limite total de usos, pedido mínimo, ativo/inativo; recalculado no servidor.
_Avoid_: Cashback, pontos

**Cupom de boas-vindas**:
Desconto em R$ ou % configurável pelo dono, oferecido ao criar conta se o programa estiver ligado (opt-in).
_Avoid_: Item grátis estruturado, gamificação, cashback, RPG de pontos

**Fidelidade por pedidos**:
Programa pós-MVP: N pedidos concluídos → item grátis ou cupom (gerido pelo dono).
_Avoid_: Usar no MVP como se já fosse requisito de build

**Cancelamento (pedido)**:
Ação no painel que marca o pedido como cancelado; se houver PIX/crédito pago, dispara estorno automático no gateway.
_Avoid_: Void genérico, delete

**Pausa (loja)**:
Interruptor do Dono **ou do Operador** que bloqueia o checkout imediatamente, independente do horário de funcionamento; toda ativação/retomada é auditada e o Dono é avisado quando foi o Operador (decisão 63, P-OPE-4).
_Avoid_: Fechado (é horário), offline genérico
