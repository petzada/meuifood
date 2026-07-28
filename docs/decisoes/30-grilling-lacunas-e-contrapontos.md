# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** B → [36](36-tenant-store-id-canonico.md)  
**Método:** `/grill-with-docs`  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Fechado nesta sessão

A [31] · Comercial [32] · L · N [33] · O [34] · P [35] · **B [36](`store_id`)**

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **C** | DESIGN.md Airbnb vs primary Foode | Contraponto |
| D | Matriz dono vs operador | Lacuna |
| E | Cancelamento + estorno piloto | Lacuna |
| F | Marketing no `web` | Lacuna leve |
| G | Loja fechada / horário | Lacuna |
| H | Frete: bairro (não km) | Lacuna / contraponto |
| I | Guest → conta | Lacuna |
| J | Sem staging | Contraponto |
| K | Fidelidade MVP | Lacuna |
| M | Homologação BaaS | Comercial |

---

## Rodada atual — próxima pergunta: **C**

### C) DESIGN.md Airbnb — manter Rausch como primary Foode?

**Contexto:** [29](29-libs-ops-acrescimos-mvp.md) manda alinhar Tailwind/shadcn a [DESIGN.md](../DESIGN.md) (Airbnb: Rausch #ff385c, property-card, search-orb). Marca do produto é **Foode Delivery**.

**Contraponto:** Primary Rausch + linguagem de hospedagem falha o brand test de um SaaS de delivery local.

**Recomendação:** Extrair de DESIGN.md só **primitives de superfície** (canvas, ink, hairline, radii, spacing, um shadow). Definir **`colors.primary` Foode** próprio (não Rausch) em `packages/shared` antes do shadcn. Não portar property-card / search-orb / Luxe / Plus. Airbnb fica como referência de densidade, não como marca.

**Alternativa:** shipar Rausch “só no MVP” e trocar depois — barato agora, confuso com lojistas piloto.

---

## Fila

**D** operador só pedidos · **E** cancel → refund manual · **F** marketing no `web` · **G** fechado = checkout bloqueado · **H** frete bairro/fixa · **I** guest→conta · **J** sem staging · **K** fidelidade simples.

## Próximo passo

Founder responde **C**.
