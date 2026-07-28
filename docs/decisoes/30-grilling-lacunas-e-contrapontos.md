# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** A + pacote [32](32-taxas-e-assinatura-fixa-unica.md)  
**Método:** `/grill-with-docs`  
**Produto:** [16](16-tese-produto-fechada.md) · **Stack:** [28](28-tese-stack-mvp.md) · **Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Objetivo

Fechar lacunas e contrapor decisões soft antes do bootstrap. Não reabrir âncoras já confirmadas (exceto supersede explícito de números comerciais — feito em [32](32-taxas-e-assinatura-fixa-unica.md)).

## Âncoras (atualizadas)

SaaS canal próprio · ICP PME · complementar marketplace · **assinatura R$ 179** (teto R$ 15k GMV online) · **taxas [32](32-taxas-e-assinatura-fixa-unica.md)** · Woovi + Asaas · piloto MEI · web `/loja/[slug]` · guest + conta · dono/operador · 1 CNPJ = 1 loja · status enxutos · delivery + retirada · cardápio com complementos · WhatsApp só `wa.me` · monorepo pnpm · Next web/admin · Fastify api · Supabase/Prisma/RLS · poll 10s · Railway + GH Actions · Tailwind/shadcn/Vitest/Sentry/Cron · **GMV = só online** ([31](31-definicao-operacional-gmv.md)).

## Fechado nesta sessão

| # | Tema | Decisão |
| --- | --- | --- |
| **A** | GMV operacional | [31](31-definicao-operacional-gmv.md) — online only; exclui na entrega e cancelados |
| **Comercial** | Taxas + assinatura | [32](32-taxas-e-assinatura-fixa-unica.md) — supersede 06/12 |
| **L** | Elo / bandeiras crédito | Política: qualquer bandeira na mesma tabela crédito ([32](32-taxas-e-assinatura-fixa-unica.md)); custo Asaas = validação comercial |

## Mapa restante

| # | Tema | Tipo | Dependência |
| --- | --- | --- | --- |
| **N** | Acima de R$ 15k GMV — comportamento de produto | Lacuna (nova) | [32](32-taxas-e-assinatura-fixa-unica.md) |
| **O** | Débito + voucher no checkout MVP (dia 1)? | Lacuna (nova) | [32](32-taxas-e-assinatura-fixa-unica.md) |
| **P** | Cobrança da assinatura anual (como recebe os R$ 1.718,40) | Lacuna leve | [32](32-taxas-e-assinatura-fixa-unica.md) |
| B | `store_id` canônico | Lacuna | — |
| C | DESIGN.md Airbnb vs primary Foode | Contraponto | — |
| D | Matriz dono vs operador | Lacuna | — |
| E | Cancelamento + estorno piloto | Lacuna | `pilot_platform` |
| F | Marketing no `web` | Lacuna leve | — |
| G | Loja fechada / horário | Lacuna | — |
| H | Frete: bairro (não km) | Lacuna / contraponto | — |
| I | Guest → conta | Lacuna | — |
| J | Sem staging | Contraponto | — |
| K | Fidelidade MVP | Lacuna | Conta |
| M | Homologação BaaS | Comercial | — |

---

## Rodada atual — próxima pergunta: **N**

### N) O que o produto faz quando a loja passa de R$ 15.000 de GMV no mês?

**Contexto:** [32](32-taxas-e-assinatura-fixa-unica.md) diz “negociar com comercial/desenvolvedor” — isso é processo humano, não regra de software. Sem decisão, o bootstrap não sabe se bloqueia checkout, só alerta, ou ignora o teto no código.

**Recomendação:** No MVP, teto é **soft + ops**:

1. Painel do dono mostra GMV do mês vs R$ 15.000 (barra/alerta aos 80% e 100%).  
2. **Não** bloqueia novos pedidos online automaticamente.  
3. Acima de 100%: flag interna + founder contacta (WhatsApp/e-mail) para negociar add-on ou plano custom.  
4. Hard block / cobrança automática de overage = **pós-MVP**.

**Por quê:** GTM consultivo de ~10 lojas; hard cap no checkout pune o lojista no pior momento (mês bom) e exige billing de overage que [27](27-fora-mvp-tecnico.md) já tirou do MVP.

**Alternativas:** (a) hard block checkout ao passar R$ 15k; (b) overage automático R$/GMV — ambos mais produto do que o piloto precisa.

---

## Itens ainda na fila (resumo das recomendações)

### O) Débito e voucher no MVP?

**Recomendação:** **Sim no modelo de dados e taxas**; no checkout do **piloto (1º cliente)** liberar PIX + crédito + na entrega; débito/voucher com flag `payment_methods` por loja (off até validar Asaas no ambiente). Evita scope creep do dia 1 sem jogar fora a tabela comercial.

### P) Assinatura anual

**Recomendação:** MVP = cobrança **manual/ops** (PIX/boleto Foode); flag `billing_cycle: monthly | annual` na loja + data de renovação. Self-serve de cartão para assinatura = depois.

### B) `store_id`

Tenant = Loja; coluna **`store_id`**; dono/operador em `store_members`.

### C) Design

Tokens de superfície do DESIGN.md; **`colors.primary` Foode** próprio (não Rausch); sem property-card/search-orb.

### D) RBAC mínimo

Operador: só pedidos/status. Sem cardápio/financeiro/equipe no MVP.

### E) Cancelamento

Ledger `refund_needed` → estorno manual no gateway; sem UI de estorno.

### F–K

Ver propostas da rodada 1 original (inalteradas).

---

## ADRs load-bearing

| Decisão | ADR |
| --- | --- |
| 3 apps web/admin/api | [0001](../adr/0001-tres-apps-web-admin-api.md) |
| Railway + Supabase | [0002](../adr/0002-railway-supabase-nao-vercel.md) |
| Dual gateway | [0003](../adr/0003-woovi-pix-asaas-cartao.md) |
| Piloto custódia | [0004](../adr/0004-modo-piloto-custodia.md) |

## Próximo passo

Founder responde **N** (teto R$ 15k). Em seguida **O** (débito/voucher no checkout) — ambos filhos de [32](32-taxas-e-assinatura-fixa-unica.md).
