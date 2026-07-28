# Decisão: UI de billing no painel (MVP read-only + pós-MVP cobrança)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #P  
**Depende de:** [22](22-auth-lojista-e-consumidor.md), [32](32-taxas-e-assinatura-fixa-unica.md), [33](33-teto-gmv-comercial-fora-do-produto.md)

## Decisão

### Onboarding (MVP)

1. Founder/dev **convida** o comerciante via **Supabase Auth** (invite).  
2. Comerciante completa cadastro e entra no **painel (`admin`)**.  
3. No painel existe área de **plano / billing** com opções **mensal (R$ 179)** e **anual (R$ 1.718,40 · 20% OFF)**.

### MVP — estrutura pronta, cobrança ainda fora

| Peça | MVP |
| --- | --- |
| UI de plano (mensal / anual) no painel | **Sim** — estrutura e copy prontas |
| Checkout self-serve da assinatura (pagar na hora) | **Não** — UI **read-only** / informativa |
| Ativação do plano | **Flag** setada pelo founder/ops após receber pagamento **por fora** (`plan_status` / `plan_active` + ciclo mensal|anual) |
| Teto GMV R$ 15k / overage | Continua **fora** do produto ([33](33-teto-gmv-comercial-fora-do-produto.md)) — a UI de plano **não** é meter de GMV |

Sem a flag de plano ativo, o painel pode restringir operação (ex.: loja não publica / não aceita pedido) — detalhe fino de “o que bloqueia sem plano” pode fechar na implementação; a regra de produto é: **acesso convidado + plano ativado ops**.

### Pós-MVP (registrado — não buildar agora)

Quando escalar (Brasil / self-serve), incluir cobrança automática da assinatura, escolhendo (ou oferecendo) um destes caminhos:

| Caminho | Provider | Uso |
| --- | --- | --- |
| **PIX recorrente** | Woovi | Assinatura com recorrência PIX |
| **Cartão mensal** | Asaas | Assinatura mensal no crédito |

A UI de billing do MVP deve ser **encaixável** nesses fluxos depois (mesmas telas de plano → “Pagar” / webhook de assinatura), sem redesenhar o domínio `plan` do zero.

## Relação com [33](33-teto-gmv-comercial-fora-do-produto.md)

- [33](33-teto-gmv-comercial-fora-do-produto.md) = sem meter GMV vs R$ 15k, sem hard block por volume, negociação de teto fora.  
- **Esta decisão** = UI de **plano Foode** (mensal/anual) no painel; dinheiro da assinatura no MVP ainda entra por fora + flag.  
Não se contradizem: um é cota de GMV; outro é assinatura SaaS.

## Rejeitado nesta rodada

- Zero UI de billing no MVP (proposta anterior do grilling P).  
- Self-serve de pagamento da assinatura já no piloto.
