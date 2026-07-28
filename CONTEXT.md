# Foode Delivery

SaaS web mobile-first de canal próprio (cardápio + pedidos + gestão) para PME de delivery local. A loja traz o consumidor; a plataforma cobra mensalidade por GMV e taxas de pagamento (PIX/cartão), sem comissão de marketplace.

## Language

### Atores

**Comerciante**:
Pessoa ou empresa (CNPJ) que é o cliente pagante do SaaS — dono do estabelecimento.
_Avoid_: Cliente (ambíguo), merchant (só em código de gateway), conta SaaS

**Dono**:
Papel do comerciante no painel: acesso total (config, cardápio, pedidos, pagamentos, relatórios, plano).
_Avoid_: Admin genérico, owner (salvo campo técnico `owner`)

**Operador**:
Funcionário da loja com acesso operacional a pedidos/status; sem visão financeira, taxas, mensalidade ou relatórios sensíveis.
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
Entrega no endereço do consumidor; taxa configurável pela loja (bairro e/ou km).
_Avoid_: Frete (salvo copy)

**Retirada**:
Consumidor busca no balcão; opcional por loja.
_Avoid_: Pickup (salvo código), balcão-only

### Pagamento e receita

**GMV**:
Faturamento da loja **na plataforma** no mês de referência — base da faixa de mensalidade. Definição operacional fina: ver grilling de lacunas (ainda em confirmação).
_Avoid_: Receita da plataforma, faturamento do CNPJ fora do canal, GMV de marketplace

**Mensalidade**:
Assinatura SaaS em três faixas por GMV (R$ 129 / 179 / 229); mesmas features em todas.
_Avoid_: Plano por feature, comissão, take-rate de vitrine

**Taxa de pagamento**:
MDR cobrado do comerciante no PIX/cartão online (markup de gateway), distinto de mensalidade e de comissão de marketplace.
_Avoid_: Comissão, take-rate (salvo conversa de marketplace)

**PIX**:
Pagamento online via Woovi; taxa ao lojista 1,29% D+0.
_Avoid_: OpenPix (marca legacy), boleto

**Cartão online**:
Pagamento online via Asaas; Visa/Master e Elo/outros com tabelas distintas.
_Avoid_: Maquininha (isso é na entrega)

**Pagamento na entrega**:
Consumidor paga fora da plataforma (maquininha/dinheiro do lojista); sem take da Foode.
_Avoid_: COD genérico sem contexto

**Modo de cobrança**:
Config da loja que define custódia/gateway: `pilot_platform`, `baas` ou `merchant_own_account`.
_Avoid_: Gateway mode genérico, split (é mecanismo dentro de baas)

**Ledger de repasse**:
Registro pedido ↔ cobrança ↔ líquido ↔ data prevista ↔ data pago — obrigatório no modo piloto.
_Avoid_: Extrato bancário, settlement genérico

### Apps e superfície

**Storefront (`web`)**:
App Next público: marketing (se couber) + `/loja/[slug]` (cardápio/checkout).
_Avoid_: Front, site da loja (ambíguo com site do comerciante)

**Painel (`admin`)**:
App Next do lojista: pedidos, cardápio, configs, equipe.
_Avoid_: Dashboard genérico, backoffice

**API (`api`)**:
Serviço Fastify: domínio, webhooks, jobs leves; fonte de verdade de pedidos/pagamentos.
_Avoid_: BFF (salvo exceção fina), serverless routes de produção no Next

### Fidelidade

**Cupom de boas-vindas**:
Incentivo opt-in do comerciante ao criar conta após pedido guest — MVP de fidelidade, não motor de pontos.
_Avoid_: Gamificação, cashback, RPG de pontos
