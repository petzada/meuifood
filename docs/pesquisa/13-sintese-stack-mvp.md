# Síntese: stack MVP — Foode Delivery

**Data:** jul/2026 · **Tipo:** consolidação das pesquisas 10–12 · **Não é decisão** (alimenta grilling de stack)

**Fontes:** [10 frontend](10-stack-frontend-concorrentes.md) · [11 backend](11-stack-backend-multitenant-concorrentes.md) · [12 pagamentos/infra](12-stack-pagamentos-infra-integracoes.md)  
**Tese de produto (fechada):** [16](../decisoes/16-tese-produto-fechada.md)

---

## 1. Tabela comparativa (mercado → Foode)

| Camada | Padrão concorrentes / segmento | Implicação Foode MVP |
| --- | --- | --- |
| **Frontend consumidor** | Web mobile-first (link/QR); app nativo raro; SPA comum; SSR/Next citado (Goomer vaga) mas pouco confirmado no cardápio | `/loja/[slug]` web mobile-first; **sem** app store; PWA opcional depois |
| **Frontend lojista** | Painel web; apps/desktop (Insta, MenuDino PDV) são fase 2 | **Só painel web** no MVP (pedidos + cardápio + configs) |
| **Framework FE** | React (Goomer), Angular+Vue (Anota), Nuxt/Vue sinais fracos (Insta) | **Um** framework; React/Next ou Vue/Nuxt — Angular só se expertise prévia |
| **Backend** | Node/TS dominante nos players “modernos” (Anota Nest, Goomer Fastify); PHP legado existe | Monólito Node/TS ou full-stack Next; **sem** microsserviços/Kafka/K8s |
| **Dados** | Postgres preferido greenfield; MySQL comum; Mongo em Anota (documentos/eventos) | **Postgres** shared schema + `store_id` (1 loja/tenant no MVP; workspaces depois) |
| **Cache / filas** | Redis + SQS/Rabbit em escala; MVP costuma viver sem | Adiar Redis/fila até dor real; cron + tabela para webhooks/reconciliação |
| **Multi-tenant / roles** | Roles dono≠operador em todos; multiloja (Goomer) | Workspaces + `owner` / `operator` (já tese produto) |
| **Realtime pedidos** | Marketing “tempo real”; Consumer/API parceiro usa **polling**; WS em perfis Anota | **Polling 5–10s** no MVP; WS/SSE depois |
| **Auth lojista** | E-mail+senha + convite equipe | E-mail+senha + convite operador; magic link = decisão no grilling |
| **Auth consumidor** | Guest / login leve | Guest + conta (já tese); provedor magic link no grilling |
| **Pagamentos** | Conta-por-lojista (padrão SaaS) vs split/BaaS (escala) | Piloto MEI+D+32 → BaaS; fallback conta Asaas/loja; PIX Woovi |
| **Infra** | Vercel + Postgres gerenciado em refs open-source BR; AWS em Anota/Goomer escala | Vercel-class + Postgres + storage fotos; sem K8s |
| **WhatsApp** | Bots/API em Anota/Cardápio Web; MenuDino WhatsApp grátis | **Só `wa.me`** no MVP (já tese) |

---

## 2. Opções viáveis para o MVP (3 caminhos)

### Caminho A — **Next.js full-stack monorepo leve** (recomendado na síntese)

| | |
| --- | --- |
| **O quê** | 1 repo: app Next (App Router) com storefront `/loja/[slug]`, painel `/painel`, API routes (ou Route Handlers) + Postgres |
| **Pros** | Um deploy (Vercel); SSR no cardápio ajuda SEO/share; TypeScript único; founder solo; path URL já decidido encaixa |
| **Contras** | Webhooks longos / workers em serverless precisam de padrão “persist + cron”; realtime WS é mais chato que num Node sempre-on |
| **Fit** | Melhor custo/benefício para ~1–10 lojas e tese web-only |

### Caminho B — **Next (FE) + API Node separada (Fastify/Nest)**

| | |
| --- | --- |
| **O quê** | Monorepo ou 2 packages: UI Next + API Node com Postgres; painel pode ser SPA no mesmo Next |
| **Pros** | Webhooks/jobs mais naturais; WS fácil depois; espelha Goomer/desafios Node |
| **Contras** | Dois runtimes/deploys (ou Docker); mais ops para solo; risco de over-engineering cedo |
| **Fit** | Se founder já pensa em impressão/KDS/WS em &lt;3 meses |

### Caminho C — **SPA React/Vite + BaaS (Supabase) pesado**

| | |
| --- | --- |
| **O quê** | Front SPA + Supabase (Auth, Postgres, Realtime, Storage); pouco backend custom |
| **Pros** | Realtime e auth “de graça”; velocidade inicial alta |
| **Contras** | Vendor lock; lógica de Woovi/Asaas/webhooks/ledger ainda é custom; multi-tenant RLS exige disciplina; SEO do cardápio pior sem SSR |
| **Fit** | Só se priorizar painel realtime acima de SEO/controle de pagamentos |

**Leitura da síntese (pré-grilling):** Caminho A era o default Vercel-centric.  
**Atualização pós grilling #1–#10:** ver tese fechada de stack → [28](../decisoes/28-tese-stack-mvp.md).

---

## 3. Decisões load-bearing (ordem sugerida no grilling)

1. **Repos / apps** — monorepo vs multi-repo; storefront + painel + API no mesmo app ou separados  
2. **Frontend** — Next vs Vite/SPA vs Nuxt; SSR no cardápio vs SPA pura  
3. **Backend / API style** — Route Handlers vs Fastify/Nest; REST vs tRPC  
4. **DB + multi-tenant** — Postgres + shared schema + `store_id` (workspaces fora do MVP)  
5. **Auth** — lojista (senha vs magic link) + consumidor (guest + magic link / provedor)  
6. **Realtime pedidos** — polling vs SSE vs WebSocket (ou Supabase Realtime)  
7. **Pagamentos na arquitetura** — módulos Woovi/Asaas; ledger piloto; desenho BaaS sem implementar agora  
8. **Hospedagem / CI / secrets** — Vercel + Postgres managed + storage; envs  
9. **Estrutura de pastas / modularidade mínima**  
10. **Explicitamente fora do MVP técnico** — Meta API, iFood, domínio custom, KDS, PCI próprio, subcontas Asaas sem BaaS, etc.

---

## 4. Âncoras que o grilling **não** deve reabrir

- SaaS canal próprio; web `/loja/[slug]`; Woovi PIX + Asaas cartão; piloto MEI+D+32; features completas por GMV; **1 CNPJ = 1 loja** (workspaces pós-MVP); dono vs operador; guest + conta; status enxutos; delivery + retirada; cardápio com complementos; WhatsApp só `wa.me`.

---

## Achado em 1 linha

Concorrentes usam **web mobile + painel web + Node/Postgres em escala**; Foode MVP ganha com **um app Next (ou equivalente) + Postgres shared + polling + webhooks idempotentes**, sem copiar Angular legado, K8s ou bot WhatsApp.
