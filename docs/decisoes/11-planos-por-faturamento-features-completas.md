# Decisão: planos por faturamento + escopo funcional completo

**Data:** jul/2026 · **Status:** decidido (estrutura) · **Sessão:** grilling #11  
**Supersede:** diferenciação de features entre Entry/Mid/High em [06](06-gateways-taxas-e-tiers.md) — **revogada**.

## Mudança de trajeto

De: 3 tiers com **features diferentes** e preços fixos R$ 129 / 179 / 249.  
Para: **3 preços conforme faturamento** do comerciante; **mesmo produto completo** em todos os planos.

## O que todos os planos incluem (dia 0 / MVP)

- Cardápio online  
- Pedidos online  
- Painel de status de pedidos  
- Delivery + retirada opcional (lojista liga/desliga)  
- PIX + pagamento na entrega + **cartão online**  
- Conta do consumidor + **cupons** para quem cria conta (**opt-in do comerciante**)  
- Fidelidade simples configurável (ex.: **10 pedidos = 1 item**)  
- Relatórios básicos de delivery/pedidos (**visão financeira só para dono**)  
- **Equipe:** dono + operador(es) com permissões (ver seção abaixo)  

## Fora do MVP

- **Workspaces / multi-unidade** — **adiado**; ver [20](20-tenant-mvp-sem-workspaces.md) (1 comerciante = 1 CNPJ = 1 loja no MVP).
- Extras avançados não listados (KDS dedicado, NF-e, estoque completo, bot WhatsApp, etc.).

## Equipe (multi-usuário) — reorganização

**Incluir no MVP:** mais de um login por comerciante, com **papéis e permissões**.

Motivo: o dono não quer que o **operador de delivery** (funcionário) veja **faturamento**, mensalidade ou relatórios financeiros sensíveis.

| Papel (MVP) | Acesso |
| --- | --- |
| **Dono / admin** | Tudo: config, cardápio, pedidos, pagamentos, relatórios, planos, equipe, fidelidade |
| **Operador** | **Só pedidos/status** — matriz fechada em [38](38-rbac-dono-operador-mvp.md) |

Detalhe canônico: [38](38-rbac-dono-operador-mvp.md).

## Multi-lojas / workspaces

**Revogado no MVP** — ver [20](20-tenant-mvp-sem-workspaces.md). No MVP: **1 comerciante = 1 unidade**. Multi-unidade = pós-MVP.

## Cartão / Asaas (atualização de rota)

| Momento | Modelo |
| --- | --- |
| **Só 1º cliente (piloto)** | Asaas no **MEI do founder** + repasse manual D+32 |
| **Lançamento / prospecção dos demais** | **BaaS homologado** — seguir com subcontas/split Asaas como caminho padrão |

Homologação BaaS deixa de ser “fase 2 vaga” e vira **pré-requisito antes de escalar além do amigo-piloto**.

## Precificação

Ver [32-taxas-e-assinatura-fixa-unica.md](32-taxas-e-assinatura-fixa-unica.md) (R$ 179 fixo; faixas [12](12-faixas-mensalidade-por-gmv.md) revogadas).

Taxas PIX/crédito/débito/voucher — [32](32-taxas-e-assinatura-fixa-unica.md). GMV — [31](31-definicao-operacional-gmv.md).
