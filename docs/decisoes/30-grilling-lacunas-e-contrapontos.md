# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** H → [42](42-taxa-delivery-bairro-ou-fixa.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Fechado nesta sessão

… · G [41] · **H [42]** (frete bairro/fixa; km pós-MVP)

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **I** | Guest → conta | Lacuna |
| J | Sem staging | Contraponto |
| K | Fidelidade MVP | Lacuna |
| M | Homologação BaaS | Comercial |

---

## Rodada atual — próxima pergunta: **I**

### I) Guest → criar conta: como vincular?

**Contexto:** [10](10-checkout-guest-e-conta.md) — guest sem e-mail; conta = magic link ([22](22-auth-lojista-e-consumidor.md)).

**Recomendação:** Guest **sem** e-mail obrigatório (nome, telefone, endereço se delivery). Ao “criar conta” pós-pedido: pede e-mail + confirma telefone do pedido; magic link; vincula **aquele** `order_id` (e opcionalmente outros com mesmo telefone na mesma `store_id`). Sem merge cross-loja automático.

---

## Fila

**J** sem staging completo (sandbox gateways + loja demo) · **K** fidelidade = cupom/desconto simples opt-in.

## Próximo passo

Founder responde **I**.
