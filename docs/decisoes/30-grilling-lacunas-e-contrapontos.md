# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada 1 aberta — aguarda confirmação do founder  
**Método:** `/grill-with-docs` após leitura e2e de `docs/decisoes/*`, `docs/pesquisa/*`, `DESIGN.md`  
**Produto fechado:** [16](16-tese-produto-fechada.md) · **Stack fechada:** [28](28-tese-stack-mvp.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Objetivo desta sessão

Não reabrir âncoras de produto/stack já confirmadas. Fechar **lacunas ainda abertas** e **contrapor** decisões soft / surpreendentes antes do bootstrap de código.

## Âncoras que esta sessão **não** reabre

SaaS canal próprio · ICP PME delivery · complementar marketplace · mensalidade por GMV + MDR · Woovi PIX 1,29% · Asaas cartão · piloto MEI D+32 · web `/loja/[slug]` · guest + conta · dono/operador · 1 CNPJ = 1 loja · status enxutos · delivery + retirada · cardápio com complementos/adicionais · WhatsApp só `wa.me` · monorepo pnpm · Next web/admin · Fastify api · Postgres/Prisma/RLS Supabase · auth Supabase · poll 10s · providers Woovi/Asaas · Railway + GH Actions · Tailwind/shadcn/Vitest/Sentry/Cron.

## Mapa: o que ainda está soft

| # | Tema | Tipo | Bloqueia bootstrap? | Dependência |
| --- | --- | --- | --- | --- |
| A | Definição operacional de **GMV** | Lacuna | Schema/billing ops | — |
| B | Nome canônico do tenant (`store_id`) | Lacuna (quase fechada) | Schema Prisma | — |
| C | **DESIGN.md Airbnb** como visual Foode | Contraponto | `packages/ui` / tokens | — |
| D | Matriz mínima dono vs operador | Lacuna | RBAC admin | — |
| E | Cancelamento + estorno (piloto) | Lacuna | Domínio pedidos/pagamentos | Modo `pilot_platform` |
| F | Site institucional no `web` vs separado | Lacuna leve | Rotas `apps/web` | — |
| G | Pedido com loja fechada / fora do horário | Lacuna | Checkout + cardápio | — |
| H | Precedência taxa delivery (bairro vs km) | Lacuna | Checkout frete | — |
| I | Regra guest → conta (vínculo / anti-abuso) | Lacuna | Auth consumidor | — |
| J | Sem staging + webhooks em prod | Contraponto | Ops/CI | — |
| K | Fidelidade “10 pedidos = 1 item” | Lacuna | Feature cupom | Conta consumidor |
| L | Elo no contrato Asaas | Comercial | Não (copy/taxas) | — |
| M | Homologação BaaS | Comercial/paralelo | Não o piloto | — |

---

## Rodada 1 — fronteira (perguntas independentes)

Cada item: contexto → **recomendação** → alternativas rejeitadas. Confirmar ou ajustar **um a um** (ou em lote se o founder preferir batch).

### A) O que conta como GMV da mensalidade?

**Contexto:** [12](12-faixas-mensalidade-por-gmv.md) diz “faturamento (GMV) na plataforma” sem definir se inclui taxa de entrega, pedidos cancelados, pagamento na entrega, ou só online.

**Recomendação:** GMV = soma do **total pago pelo consumidor** em pedidos com status **Concluído** no mês de referência (itens + adicionais + taxa de delivery cobrada), em **todos** os meios (PIX, cartão, na entrega). **Exclui** cancelados. Não inclui gorjeta (não existe no MVP).

**Por quê:** Mensalidade precifica uso do canal, não só MDR online; “na entrega” ainda usa cardápio/painel. Cancelados não devem empurrar faixa.

**Alternativa rejeitada:** só GMV online (PIX+cartão) — subestima lojas que usam maquininha e distorce faixas.

### B) `store_id` vs `merchant_id`?

**Contexto:** [20](20-tenant-mvp-sem-workspaces.md) / [21](21-banco-orm-multitenant.md) deixam os dois nomes possíveis.

**Recomendação:** Tenant = **Loja**; coluna canônica **`store_id`** em todas as tabelas de negócio. Comerciante/Dono = membership (`store_members.role`), não entidade tenant separada no MVP.

**Por quê:** 1:1 comerciante↔loja no MVP; `merchant_id` sugere camada que não existe ainda e confunde com IDs de gateway.

### C) DESIGN.md Airbnb — manter, adaptar ou trocar antes do código?

**Contexto:** [29](29-libs-ops-acrescimos-mvp.md) manda alinhar Tailwind/shadcn a [DESIGN.md](../DESIGN.md), que é **Airbnb** (Rausch #ff385c, Cereal, property-card, search-orb). [27](27-fora-mvp-tecnico.md) admite marca Foode própria depois.

**Contraponto:** O primeiro viewport do storefront/painel com Rausch + linguagem de hospedagem **falha o brand test** de um SaaS de delivery local. Tokens de superfície (canvas/ink/radii/1 shadow) são reutilizáveis; a **primary Rausch** e componentes de listing Airbnb não são.

**Recomendação:** No bootstrap, extrair de DESIGN.md **apenas** primitives de superfície (canvas, ink, hairline, radii, spacing, um shadow). Definir **`colors.primary` Foode** próprio (não Rausch) em `packages/shared` antes de shadcn. Não portar property-card / search-orb / Luxe / Plus. Documento Airbnb permanece como referência de densidade/spacing, não como marca.

**Alternativa rejeitada:** shipar Rausch como marca Foode “só no MVP” — barato agora, caro em percepção com os 10 lojistas piloto.

### D) Matriz mínima dono vs operador (MVP)

**Contexto:** [11](11-planos-por-faturamento-features-completas.md) — operação ≠ financeiro; checklist fino aberto.

**Recomendação (mínimo shipável):**

| Área | Dono | Operador |
| --- | --- | --- |
| Pedidos (ver/mover status) | Sim | Sim |
| Cardápio (CRUD / disponibilidade) | Sim | **Não** (MVP) |
| Horários / taxas entrega / retirada | Sim | Não |
| Relatórios / GMV / mensalidade / taxas MDR | Sim | Não |
| Equipe (convidar/remover) | Sim | Não |
| Pagamentos / ledger / modo cobrança | Sim | Não |
| Cupom/fidelidade config | Sim | Não |

Motivo de operador **sem** editar cardápio no MVP: menos superfície de RBAC; dono costuma montar cardápio; dá para abrir depois sem migração.

### E) Cancelamento + estorno no piloto

**Contexto:** Status **Cancelado** existe ([09](09-ciclo-pedido-status.md)); estorno self-service está fora ([24](24-arquitetura-pagamentos.md)). Fluxo dinheiro no `pilot_platform` não está escrito.

**Recomendação:**

1. Lojista cancela → pedido `cancelled`; se pagamento online **já confirmado**, marca `refund_needed` no ledger.  
2. Estorno = **manual** no painel Woovi/Asaas do founder + marcar ledger `refunded`.  
3. Se PIX/cartão **ainda pendente**, cancela cobrança via API se o provider permitir; senão deixa expirar + marca cancelado.  
4. Pagamento na entrega: só status, sem ledger de gateway.  
5. Sem UI de estorno no admin no MVP.

### F) Marketing institucional

**Recomendação:** Rotas de marketing no mesmo `apps/web` (`/`, `/precos`, etc.); produto em `/loja/[slug]`. Sem 4º serviço.

### G) Loja fechada / fora do horário

**Recomendação:** Cardápio **visível** (SEO/share); checkout **bloqueado** com mensagem clara (“abre às HH:MM”). Dono pode forçar “pausado” independente do horário (toggle emergência).

### H) Taxa delivery: bairro e/ou km

**Recomendação MVP:** loja escolhe **um** modo por vez — **por bairro** (lista + preço) **ou** **taxa fixa** (simples). **Km / raio:** pós-MVP (Maps/geocoding). Checkout: se endereço fora das zonas → não permite delivery.

**Contraponto à tese “bairro e/ou km”:** km no dia 1 puxa geocoding, edge cases e suporte; bairro cobre GTM local de ~10 lojas.

### I) Guest → conta

**Recomendação:** Após pedido, oferecer criar conta por **magic link no e-mail coletado no checkout** (campo e-mail **obrigatório** no guest além de telefone — ou coletar e-mail só no passo “criar conta”). Vincular pedidos guest com mesmo e-mail + telefone normalizado à nova `customer_user_id`, só pedidos daquela loja nos últimos 90 dias. Sem merge cross-loja automático.

**Nota:** Hoje [10](10-checkout-guest-e-conta.md) lista nome/telefone/endereço — **não** e-mail. Magic link exige e-mail: ou torna e-mail obrigatório no guest, ou coleta só ao criar conta (aí vínculo é por telefone+pedido explícito).

**Sub-recomendação:** Guest mantém sem e-mail; ao “criar conta”, pede e-mail + confirma telefone do pedido; vincula **aquele** `order_id` (e opcionalmente outros com mesmo telefone na loja).

### J) Sem staging (contraponto a [25](25-hospedagem-ci-ops.md))

**Contraponto:** Webhooks Woovi/Asaas + RLS + migrations Prisma direto em produção aumenta risco de downtime no piloto amigo.

**Recomendação:** Manter **sem** staging Railway completo, mas exigir: (1) sandbox/test mode dos gateways enquanto dá; (2) feature flag / `store` de staging lógica no **mesmo** Postgres (`is_demo` ou loja interna); (3) migrations com expand/contract cuidadoso. Reabrir staging só se o 1º cliente real sofrer incidente.

### K) Fidelidade “10 = 1”

**Recomendação MVP:** Contador de pedidos **Concluídos** por consumidor **naquela loja**; ao atingir N (default 10, configurável pelo dono), gera **um cupom** de item grátis (item escolhido pelo dono ou % fixo — preferir **desconto em R$** configurável para não modelar “item grátis” complexo). Opt-in off por padrão.

### L / M) Elo e BaaS

Fora do grilling de produto/código: checklist comercial paralelo. Não bloqueiam schema do piloto.

---

## Decisões surpreendentes já fechadas (vale ADR, não reabrir)

| Decisão | Por que surpreende | ADR |
| --- | --- | --- |
| 3 apps (web/admin/api) em vez de Next monolítico | Pesquisa [13](../pesquisa/13-sintese-stack-mvp.md) recomendava Caminho A | [0001](../adr/0001-tres-apps-web-admin-api.md) |
| Railway + Supabase (não Vercel) | Default de mercado/síntese era Vercel | [0002](../adr/0002-railway-supabase-nao-vercel.md) |
| Dual gateway Woovi + Asaas | Mais ops que um PSP único | [0003](../adr/0003-woovi-pix-asaas-cartao.md) |
| Custódia piloto `pilot_platform` | Caminho A (conta por lojista) era “recomendado agora” na pesquisa | [0004](../adr/0004-modo-piloto-custodia.md) |

## Próximo passo

Founder confirma/ajusta **Rodada 1 (A–K)**. Itens confirmados viram decisões `30+` / updates em decisões existentes + termos no `CONTEXT.md`. Fronteira seguinte (cancelamento fino de cobrança, e-mail templates, lista de slugs reservados) só depois de A–E.
