# Foode Delivery

SaaS web mobile-first de canal próprio (cardápio + pedidos + gestão) para PME de delivery local. A loja traz o consumidor; a plataforma cobra assinatura fixa (com teto de GMV online) e taxas de pagamento (PIX/cartão/débito/voucher), sem comissão de marketplace.

## Language

### Atores

**Comerciante**:
Pessoa ou empresa (CNPJ) que é o cliente pagante do SaaS — dono do estabelecimento.
_Avoid_: Cliente (ambíguo), merchant (só em código de gateway), conta SaaS

**Dono**:
Papel do comerciante no painel: acesso total (config, cardápio, pedidos, pagamentos, relatórios, plano).
_Avoid_: Admin genérico, owner (salvo campo técnico `owner`)

**Operador**:
Funcionário da loja com acesso **somente** a pedidos/status; sem cardápio, horários, frete, relatórios, plano, equipe ou fidelidade.
_Avoid_: Atendente, colaborador, staff (salvo UI)

**Consumidor**:
Pessoa que pede pelo link/QR da loja (guest ou com conta).
_Avoid_: Cliente final, usuário (salvo auth), comprador

**Guest**:
Consumidor que conclui pedido sem conta; dados mínimos gravados no pedido.
_Avoid_: Anônimo, visitante

### Tenant e loja

**Loja**:
Unidade operacional e tenant de dados no MVP: um CNPJ, um slug, um cardápio, um painel. Isolamento multi-tenant via `store_id`.
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

**Pedido**:
Pedido do consumidor na loja: itens, fulfillment, pagamento e status no painel.
_Avoid_: Order (salvo código), comanda

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

**GMV**:
Soma do total pago pelo consumidor em pedidos **Concluídos** no mês (itens + adicionais + taxa de delivery), só em meios **online** (PIX, crédito, débito, voucher). Exclui pagamento na entrega e cancelados. Usado para o teto da assinatura.
_Avoid_: Receita da plataforma, faturamento do CNPJ fora do canal, GMV de marketplace, GMV com maquininha na entrega

**Mensalidade**:
Assinatura SaaS fixa **R$ 179**/mês (ou anual com 20% OFF). No painel há UI de plano; no MVP a ativação é por flag após pagamento fora. Teto de GMV R$ 15k é âncora comercial, sem meter no app.
_Avoid_: Três faixas 129/179/229, comissão, take-rate de vitrine, barra GMV vs teto

**Plano (assinatura Foode)**:
Produto comercial contratado pela loja (mensal ou anual). No MVP: tela no painel + ativação por flag ops; cobrança self-serve (PIX Woovi recorrente ou cartão Asaas) = pós-MVP.
_Avoid_: Meter de GMV, overage automático

**Taxa de pagamento**:
MDR cobrado do comerciante no PIX/crédito/débito/voucher online (markup de gateway), distinto de mensalidade e de comissão de marketplace.
_Avoid_: Comissão, take-rate (salvo conversa de marketplace)

**PIX**:
Pagamento online via Woovi; taxa ao lojista **1,19%** D+1.
_Avoid_: OpenPix (marca legacy), boleto

**Crédito online**:
Pagamento online via Asaas; **3,29% + R$ 0,79** D+33, qualquer bandeira à vista.
_Avoid_: Maquininha (isso é na entrega)

**Débito online**:
Pagamento online via Asaas (taxa futura na tabela comercial). **Fora do MVP.**
_Avoid_: Débito na maquininha do lojista

**Voucher online**:
Pagamento online via Asaas / vale (taxa futura na tabela comercial). **Fora do MVP.**
_Avoid_: Cupom de fidelidade Foode (é outro conceito)

**Pagamento na entrega**:
Consumidor paga fora da plataforma (maquininha/dinheiro do lojista); sem take da Foode e **fora do GMV**.
_Avoid_: COD genérico sem contexto

**Modo de cobrança**:
Config da loja que define custódia/gateway: `pilot_platform`, `baas` ou `merchant_own_account`.
_Avoid_: Gateway mode genérico, split (é mecanismo dentro de baas)

**Tomadora BaaS**:
PJ da Foode (alvo: **LTDA** pós-piloto) que orquestra subcontas/split Asaas para comerciantes; não é instituição autorizada pelo Bacen.
_Avoid_: White label (termo legado), Foode como “banco”, MEI como Tomadora de escala

**Prestadora BaaS**:
Instituição autorizada que processa/custodia — no arranjo Foode, o **Asaas** (marca obrigatória em onboarding/comprovantes).
_Avoid_: Gateway genérico, PSP sem distinguir do papel Bacen

**Homologação BaaS**:
Liberação comercial/compliance com gerente Asaas (playbook marca, docs, Res. Conjunta 16/17) para operar subcontas sem o teto do período de avaliação.
_Avoid_: “Ativar subcontas” sem homologação, sandbox como equivalente

**Piloto validado**:
Julgamento manual do founder de que o comerciante-modelo opera a plataforma de ponta a ponta; gatilho para abrir a LTDA. Sem métrica mínima escrita (GMV/N pedidos).
_Avoid_: Go/no-go automático, “4 semanas = validado” como regra

**Comerciante-modelo**:
Único comerciante do piloto (`pilot_platform`); próximos só após homologação BaaS, com ativação manual.
_Avoid_: “Primeiro cliente” ambíguo, beta multi-loja

**Ledger de repasse**:
Registro pedido ↔ cobrança ↔ líquido ↔ data prevista ↔ data pago — obrigatório no modo piloto.
_Avoid_: Extrato bancário, settlement genérico

### Apps e superfície

**Storefront (`web`)**:
App Next público: marketing (se couber) + `/loja/[slug]` (cardápio/checkout). Visual: primary Foode, containers outline.
_Avoid_: Front, site da loja (ambíguo com site do comerciante)

**Painel (`admin`)**:
App Next do lojista: pedidos, cardápio, configs, equipe, UI de plano. Mesma linguagem visual outline + primary Foode.
_Avoid_: Dashboard genérico, backoffice

**API (`api`)**:
Serviço Fastify: domínio, webhooks, jobs leves; fonte de verdade de pedidos/pagamentos.
_Avoid_: BFF (salvo exceção fina), serverless routes de produção no Next

**Primary Foode**:
Cor de marca `#F35050` extraída do logo oficial; CTAs e ênfase brand.
_Avoid_: Rausch Airbnb, purple AI-default

**Container outline**:
Bloco de conteúdo com borda fina, sem fill, sem shadow, cantos arredondados.
_Avoid_: Card com fill+sombra como default

### Fidelidade

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
Toggle do dono que bloqueia o checkout imediatamente, independente do horário de funcionamento.
_Avoid_: Fechado (é horário), offline genérico
