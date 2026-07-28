# Pesquisa: stack backend, dados, realtime e multi-tenant (concorrentes)

**Data:** jul/2026 · **Tipo:** pesquisa técnica de mercado (não é decisão de arquitetura)

**Escopo:** Anota AI, Goomer, InstaDelivery, MenuDino/Consumer, Cardápio Web + práticas comuns de SaaS de cardápio digital / canal próprio BR.

**Legenda:** `[FATO]` evidência pública · `[INFERÊNCIA]` indício razoável · `[DESCONHECIDO]` stack não divulgada.

---

## Síntese por concorrente

| Player | Backend (público) | DB / cache / filas | Multi-tenant / roles | Realtime pedidos | Auth lojista |
| --- | --- | --- | --- | --- | --- |
| **Anota AI** | `[FATO]` Node.js + TypeScript; NestJS citado em perfis; microsserviços event-driven; AWS | `[FATO]` MongoDB + RDS/PostgreSQL; Redis; RabbitMQ + Kafka; SQS/SNS/EventBridge | `[FATO]` Colaboradores com permissões/cargos no painel | `[INFERÊNCIA]` Painel de gestão + app; ordem de grandeza alta → filas/eventos; mecanismo WS vs poll **não documentado** | `[FATO]` E-mail + senha (`admin.anota.ai`); reset por fluxo clássico |
| **Goomer** | `[FATO]` Desafios oficiais: Node + TS, Fastify/Express (sem Nest); `[FATO]` engenheiros citam Node, Fastify, Lambda, SNS/SQS; legado PHP/Yii2 (Abrahão) | `[FATO]` Desafios pedem Postgres **ou** MySQL; `[FATO]` Redis + DynamoDB em integrações OpenDelivery | `[FATO]` Equipe: Admin / Gerente / Operador / Marketing; modo multiloja (franquias) | `[INFERÊNCIA]` KDS/PDV “tempo real” no marketing; tech exata **não pública** | `[FATO]` Convite por e-mail + login painel; confirmação de cadastro por link no e-mail |
| **InstaDelivery** | `[DESCONHECIDO]` | `[DESCONHECIDO]` | `[FATO]` Gerente / Caixa / Garçom / Motoboy | `[FATO]` App Windows/mobile com impressão automática de comandas (implica push/poll local) | `[FATO]` E-mail + senha por usuário |
| **MenuDino (Consumer)** | `[DESCONHECIDO]` | `[DESCONHECIDO]` | `[FATO]` Admin vs atendente/supervisor/entregador + permissões granulares | `[FATO]` Marketing: pedidos entram no PDV; rastreio no mapa (implica updates quase realtime) | `[DESCONHECIDO]` detalhes de magic link/OTP; padrão PDV = login clássico |
| **Cardápio Web** | `[DESCONHECIDO]` (site de vagas sem stack) | `[DESCONHECIDO]` | `[INFERÊNCIA]` Suite gestão + automação WhatsApp → multi-usuário típico do segmento | `[INFERÊNCIA]` Chatbot + cardápio → pedidos no painel; tech **não pública** | `[DESCONHECIDO]` |

---

## Detalhe por fonte

### Anota AI — `[FATO]` mais transparente via LinkedIn

- Stack recorrente em perfis de engenharia: **Node.js, TypeScript, NestJS**, AWS (EC2/Lambda/S3), **Kubernetes**, Kong, ArgoCD.
- Dados: **MongoDB** + **PostgreSQL (RDS)**; cache **Redis**.
- Mensageria: **RabbitMQ**, **Kafka**, **SQS/SNS**, EventBridge Scheduler (ex.: >100k eventos/dia citado por engenheira).
- Produto: cardápio digital + robô WhatsApp; pedidos caem no gestor; colaboradores com permissões.
- **Não** há whitepaper oficial de stack — tudo acima é **reconstrução por perfis**, não anúncio da empresa.

### Goomer — `[FATO]` desafios + engenheiros

- Repos `goomerdev/job-dev-backend-*`: API cardápio em **Node + TypeScript**, SQL (**Postgres ou MySQL**), preferência **Fastify/Express**.
- Perfil público (ex. OpenDelivery): **Node + Fastify + Redis**, fallback **DynamoDB**, serverless **>400 Lambdas**, SNS/SQS; unificação com legado **PHP/Yii2**.
- Produto: roles Admin/Gerente/Operador/Marketing; convite por e-mail; **multiloja** para franquias (totens/cardápio centralizado).

### InstaDelivery / MenuDino-Consumer / Cardápio Web

- **Nenhuma** publicação técnica confiável de linguagem/DB.
- Evidência de **produto multi-usuário com roles** (InstaDelivery, Consumer) e de **canal próprio + PDV** (MenuDino).
- InstaDelivery: software desktop para impressão automática → padrão comum: agente local + API cloud (mecanismo de sync **não documentado**).

### Práticas do segmento BR (além dos 5)

| Tema | Padrão observado | Confiança |
| --- | --- | --- |
| Linguagem API | Node/TS dominante nos players “modernos” e em desafios; PHP/Laravel ainda presente em food SaaS menores | Alta (mercado), média (por player) |
| DB | Postgres preferido em greenfield; MySQL ainda comum; Mongo em domínios documentais/eventos (ex. Anota) | Alta |
| Multi-tenant | Shared DB + `tenant_id` / `estabelecimentoId`; RLS Postgres em plataformas white-label maduras | Alta (prática), baixa (código dos 5) |
| Realtime | Marketing fala “tempo real”; implementação típica: **WebSocket/Socket.IO** ou **polling 5–30s**; SSE menos citado | Média |
| Filas | Pedidos, WhatsApp, impressão, billing → filas (SQS/Rabbit) assim que há volume/integrações | Alta |
| Cache | Redis para cardápio/listagens e pub/sub de localização | Alta |
| Auth lojista | E-mail+senha + convite; magic link/OTP **raramente** documentados no painel (OTP mais comum no **cliente final** / WhatsApp) | Alta |

Referência de arquitetura white-label delivery BR (Mind Group / DEV.to, 30+ marcas): Kong + Node/Go, **Postgres RLS**, Redis, RabbitMQ, WebSocket + Redis Pub/Sub — útil como **padrão de escala**, não como stack dos concorrentes nomeados.

---

## Multi-tenant / workspaces / roles (produto)

| Conceito | Como aparece nos concorrentes | Implicação técnica típica |
| --- | --- | --- |
| Tenant = loja / estabelecimento | 1 conta SaaS ↔ 1 ou N unidades | Coluna `store_id` / workspace em todas as tabelas de negócio |
| Workspace multi-loja | Goomer multiloja/franquia; Anota escala multi-cliente na plataforma | Conta “rede” + memberships loja |
| Dono vs operador | Goomer Admin≠Operador; Anota colaboradores; Insta Gerente≠Caixa/Garçom; Consumer Admin≠Atendente | RBAC por papel + checklist de permissões |
| Cliente final | Sem login ou login leve no pedido (WhatsApp/link) | Auth do painel **≠** auth do cardápio público |

---

## Pedidos “quase realtime”

| Abordagem | Quando basta | Quando dói |
| --- | --- | --- |
| **Polling** (5–15s) | MVP, poucas lojas, painel web simples | Bateria mobile, latência perceptível, carga DB |
| **SSE** | Feed unidirecional (só servidor → painel) | Menos libs client; reconnect a tratar |
| **WebSocket** | KDS, status vivo, multi-abas, app lojista | Sticky sessions / Redis adapter em >1 instância |
| **Fila + push** (FCM/APNs) + sync | App nativo / impressão | Complexidade de delivery guarantee |

Produto marketing (“cai na tela”) **não prova** WebSocket. Vários players menores admitem poll (~30s) ou só “notificação + refresh”.

---

## Auth em produtos similares

| Fluxo | Onde aparece | Nota |
| --- | --- | --- |
| E-mail + senha | Anota, InstaDelivery, padrão PDV | Dominante no lojista |
| Convite por e-mail | Goomer equipe | Onboarding de operador |
| Link de confirmação no e-mail | Goomer cadastro | Não é magic-link contínuo |
| OTP / WhatsApp | Comum no **fluxo do consumidor** (pedido/bot), pouco documentado como login único do painel | Não assumir OTP no MVP do admin |
| JWT / sessão | `[INFERÊNCIA]` padrão de APIs Node do segmento | Isolar claims com `tenant_id` + `role` |

---

## Stack “típica” do segmento (referência, não cópia)

```
API: Node.js + TypeScript (Fastify/Nest/Express)
DB:  PostgreSQL (shared schema + tenant_id; RLS opcional depois)
Cache: Redis (cardápio, rate limit, pub/sub)
Filas: SQS ou RabbitMQ (WhatsApp, e-mail, billing, impressão)
Realtime: WebSocket (produção) ou polling curto (MVP)
Auth: e-mail/senha + convites; JWT com tenant + role
Storage: S3 (fotos cardápio)
```

PHP/Laravel e MySQL continuam viáveis em SaaS food menores; players que crescem para microsserviços (Anota/Goomer) gravitam Node + cloud AWS + filas.

---

## Fontes / URLs

| Fonte | URL | Uso |
| --- | --- | --- |
| Anota — perfis engenharia (Thiago Soares, Rafael Silverio, Marcus Mendonça, Leticia Mantovani) | LinkedIn / Himalayas | Stack Anota |
| Goomer desafios backend | https://github.com/goomerdev/job-dev-backend-1 · job-dev-backend-interview | Preferências Node/SQL |
| Goomer ajuda — equipe/roles | https://ajuda.goomer.com.br/goomergo/painel/loja/equipe/alterar-permissoes | RBAC |
| Goomer multiloja (totens) | https://somosvarejobrasil.com.br/noticia/1107/... | Multi-loja |
| Anota — colaboradores | https://anota.ai/ajuda/minha-conta/ | Roles |
| InstaDelivery — usuários | https://blog.instadelivery.com.br/configuracoes-usuarios-instadelivery/ | Roles |
| Consumer — permissões | https://ajuda.programaconsumer.com.br/como-definir-as-permissoes-de-meus-funcionarios-e-colaboradores-no-sistema/ | Roles |
| MenuDino produto | https://consumer.com.br/menudino/ | Posicionamento |
| Cardápio Web | https://cardapioweb.com/ · https://recrutamento.cardapioweb.com/ | Produto (sem stack) |
| White-label BR (Mind Group) | https://dev.to/.../building-scalable-delivery-platforms-in-brazil-... | Padrão Postgres RLS + WS |
| Open-source referência SaaS cardápio | https://github.com/Eleva-Consulting/comanda-ia | Fastify + Postgres + Socket.IO + tenant |

---

## Implicações MVP → ~10 → dezenas de lojas

1. **MVP (~1–10 lojas):** monólito Node/TS + **Postgres shared** + `store_id` em tudo + auth e-mail/senha + **polling 5–10s** no painel de pedidos. Sem microsserviços, sem Kafka.
2. **Roles mínimos:** `owner` + `operator` (espelha Goomer/Insta/Consumer). Convite por e-mail. Evitar RBAC hiper-granular no dia 1.
3. **Antes de dezenas de lojas:** Redis (cache cardápio + adapter WS se migrar), fila para e-mail/WhatsApp/impressão, índices por `store_id` + status do pedido.
4. **Dezenas de lojas / picos jantar:** WebSocket (ou SSE) com sala por loja; rate limit por tenant; métricas **por loja** (agregado esconde outage de um cliente); invalidação de cache namespaced por tenant.
5. **Não copiar Anota/Goomer cedo:** Mongo+Kafka+K8s são sintomas de escala/WhatsApp/billing — custo e complexidade prematuros para Foode Delivery.
6. **Incerteza honesta:** stack exata de InstaDelivery, MenuDino e Cardápio Web **não é pública**; decisões devem basear-se em práticas verificáveis (Goomer desafios, Anota LinkedIn, padrão Postgres multi-tenant), não em especulação de cópia 1:1.
