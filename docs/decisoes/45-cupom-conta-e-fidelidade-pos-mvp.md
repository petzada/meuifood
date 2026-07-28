# Decisão: cupom de criação de conta (MVP) e fidelidade pós-MVP

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #K (K1–K3)  
**Depende de:** [10](10-checkout-guest-e-conta.md), [11](11-planos-por-faturamento-features-completas.md), [43](43-guest-conta-vinculo-pedido.md)

## MVP — o que shipar

| Item | Decisão |
| --- | --- |
| **K1 — Opt-in** | Dono **liga ou desliga** o programa de cupom para criação de conta (off = sem oferta de cupom no fluxo “criar conta”) |
| **K2 — Formato** | Cupom de **desconto em R$ ou %**, valor **configurável** pelo dono nas configurações **se** o programa estiver ativo |
| Disparo | Ao **criar conta** após pedido (guest → conta — [43](43-guest-conta-vinculo-pedido.md)) |

Operador **não** configura cupom ([38](38-rbac-dono-operador-mvp.md)).

## Pós-MVP — registrado (K3)

**Fidelidade por compras/pedidos**, gerenciada pelo dono — exemplos:

- N pedidos concluídos → 1 item grátis  
- N pedidos → cupom (R$/%)  

Fora do build do MVP; não modelar contador de pedidos→recompensa agora.

## Rejeitado no MVP

- Contador “10 = 1” / motor de pontos no dia 1.  
- Cupom obrigatório sem toggle do dono.
