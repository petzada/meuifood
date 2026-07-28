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
Soma do total pago pelo consumidor em pedidos **Concluídos** no mês (itens + adicionais + taxa de delivery), só em meios **online** (PIX, crédito, débito, voucher). Exclui pagamento na entrega e cancelados. Usado para o teto da assinatura.
_Avoid_: Receita da plataforma, faturamento do CNPJ fora do canal, GMV de marketplace, GMV com maquininha na entrega

**Mensalidade**:
Assinatura SaaS fixa **R$ 179**/mês (ou anual com 20% OFF) até R$ 15.000 de GMV; acima disso, negociação comercial. Mesmas features para quem assina.
_Avoid_: Plano por feature, três faixas 129/179/229, comissão, take-rate de vitrine

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
Pagamento online via Asaas; **2,19% + R$ 0,55** D+4.
_Avoid_: Débito na maquininha do lojista

**Voucher online**:
Pagamento online via Asaas (vale/voucher); **3,89%** D+16.
_Avoid_: Cupom de fidelidade Foode (é outro conceito)

**Pagamento na entrega**:
Consumidor paga fora da plataforma (maquininha/dinheiro do lojista); sem take da Foode e **fora do GMV**.
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
