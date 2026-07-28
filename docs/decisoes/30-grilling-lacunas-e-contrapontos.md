# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** I → [43](43-guest-conta-vinculo-pedido.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Fechado nesta sessão

… · H [42] · **I [43]**

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **J** | Sem staging | Contraponto |
| K | Fidelidade MVP | Lacuna |
| M | Homologação BaaS | Comercial |

---

## Rodada atual — próxima pergunta: **J**

### J) Sem staging Railway — o que mitiga risco de webhooks/migrations?

**Contexto:** [25](25-hospedagem-ci-ops.md) = PR → CI → produção; sem staging. Pagamentos + RLS aumentam risco.

**Recomendação:** Manter **sem** staging completo, com mitigação:

1. Sandbox/test mode Woovi e Asaas enquanto disponível  
2. Loja interna / `is_demo` no mesmo Postgres para QA  
3. Migrations expand/contract cuidadosas  
4. Reabrir staging só após incidente real no piloto

---

## Fila

**K** fidelidade MVP = cupom/desconto simples opt-in (não “10 pedidos = item grátis” complexo).

## Próximo passo

Founder responde **J**.
