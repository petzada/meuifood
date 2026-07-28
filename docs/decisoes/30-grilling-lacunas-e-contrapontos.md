# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** N → [33](33-teto-gmv-comercial-fora-do-produto.md)  
**Método:** `/grill-with-docs`  
**Produto:** [16](16-tese-produto-fechada.md) · **Stack:** [28](28-tese-stack-mvp.md) · **Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Objetivo

Fechar lacunas e contrapor decisões soft antes do bootstrap. Não reabrir âncoras já confirmadas (exceto supersede explícito de números comerciais — feito em [32](32-taxas-e-assinatura-fixa-unica.md)).

## Âncoras (atualizadas)

SaaS canal próprio · ICP PME · complementar marketplace · **assinatura R$ 179** (teto R$ 15k = **comercial fora do app** — [33](33-teto-gmv-comercial-fora-do-produto.md)) · **taxas [32](32-taxas-e-assinatura-fixa-unica.md)** · Woovi + Asaas · piloto MEI · web `/loja/[slug]` · guest + conta · dono/operador · 1 CNPJ = 1 loja · status enxutos · delivery + retirada · cardápio com complementos · WhatsApp só `wa.me` · monorepo pnpm · Next web/admin · Fastify api · Supabase/Prisma/RLS · poll 10s · Railway + GH Actions · Tailwind/shadcn/Vitest/Sentry/Cron · **GMV = só online** ([31](31-definicao-operacional-gmv.md)).

## Fechado nesta sessão

| # | Tema | Decisão |
| --- | --- | --- |
| **A** | GMV operacional | [31](31-definicao-operacional-gmv.md) |
| **Comercial** | Taxas + assinatura | [32](32-taxas-e-assinatura-fixa-unica.md) |
| **L** | Elo / bandeiras crédito | Mesma tabela crédito ([32](32-taxas-e-assinatura-fixa-unica.md)) |
| **N** | Teto R$ 15k | [33](33-teto-gmv-comercial-fora-do-produto.md) — sem meter/block; negociação fora |

## Mapa restante

| # | Tema | Tipo | Dependência |
| --- | --- | --- | --- |
| **O** | Quais meios no checkout MVP (dia 1)? | Lacuna | [32](32-taxas-e-assinatura-fixa-unica.md) |
| **P** | Cobrança da assinatura anual | Lacuna leve | [32](32-taxas-e-assinatura-fixa-unica.md) / [33](33-teto-gmv-comercial-fora-do-produto.md) |
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

## Rodada atual — próxima pergunta: **O**

### O) Quais meios de pagamento entram no checkout do MVP (dia 1 / piloto)?

**Contexto:** [32](32-taxas-e-assinatura-fixa-unica.md) define taxas para PIX, crédito, débito e voucher (+ na entrega fora do take). Implementar os quatro online no dia 1 aumenta superfície Asaas (débito/voucher) no piloto MEI.

**Recomendação:**

| Meio | MVP piloto (1º cliente) | Modelo / taxas |
| --- | --- | --- |
| PIX (Woovi) | **Sim** | Já na tabela |
| Crédito (Asaas) | **Sim** | Já na tabela |
| Pagamento na entrega | **Sim** | Sem MDR Foode |
| Débito (Asaas) | Flag por loja — **off** até validar no Asaas do piloto | Taxa já registrada |
| Voucher (Asaas) | Flag por loja — **off** até demanda real | Taxa já registrada |

Assim a tabela comercial e o schema de `payment_method` já conhecem os quatro; o amigo-piloto não depende de débito/voucher no go-live.

**Alternativa:** shipar os quatro online no dia 1 — mais QA de webhook/bandeira antes do 1º pedido real.

---

## Itens ainda na fila (resumo)

### P) Assinatura anual

**Recomendação:** cobrança **manual/ops** (fora do self-serve), alinhado a [33](33-teto-gmv-comercial-fora-do-produto.md). Sem portal de “assinar anual” no MVP.

### B) `store_id`

Tenant = Loja; coluna **`store_id`**; dono/operador em `store_members`.

### C) Design

Tokens de superfície do DESIGN.md; **`colors.primary` Foode** próprio (não Rausch).

### D) RBAC mínimo

Operador: só pedidos/status. Sem cardápio/financeiro/equipe no MVP.

### E) Cancelamento

Ledger `refund_needed` → estorno manual no gateway; sem UI de estorno.

### F–K

Marketing no `web` · loja fechada = cardápio visível / checkout bloqueado · frete por bairro ou taxa fixa (km depois) · guest→conta no passo pós-pedido · sem staging completo · fidelidade = cupom/desconto simples.

---

## ADRs load-bearing

| Decisão | ADR |
| --- | --- |
| 3 apps web/admin/api | [0001](../adr/0001-tres-apps-web-admin-api.md) |
| Railway + Supabase | [0002](../adr/0002-railway-supabase-nao-vercel.md) |
| Dual gateway | [0003](../adr/0003-woovi-pix-asaas-cartao.md) |
| Piloto custódia | [0004](../adr/0004-modo-piloto-custodia.md) |

## Próximo passo

Founder responde **O** (meios no checkout MVP).
