# Decisão: teto de GMV é comercial, não regra de produto

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #N  
**Depende de:** [32](32-taxas-e-assinatura-fixa-unica.md) · [31](31-definicao-operacional-gmv.md)

## Decisão

O limite de **R$ 15.000 de GMV** / mês na assinatura R$ 179 é **âncora comercial**, não feature da plataforma.

| O que | MVP |
| --- | --- |
| Fechamento de preço / teto GMV / anual | **Antes** de liberar acesso — conversa comercial (founder/ops) |
| Negociação se volume crescer | **Manual / fora** da plataforma |
| Bloquear pedidos ao passar R$ 15k | **Não** |
| Overage automático | **Não** |
| Painel com “GMV vs R$ 15k” / barra de plano | **Não** |

A plataforma foca em **gestão de delivery e cardápio digital**. Relatórios do dono mostram informações de **negócio úteis** (pedidos, faturamento do canal, etc.) — **sem** framing de cota de plano ou alerta de teto de assinatura.

## Implicação para o código

- Sem tabela/flag de enforcement de teto no checkout.  
- Sem job de overage.  
- Liberação de loja = processo ops (ativar após acordo), não self-serve de plano com meter.  
- Definição de GMV ([31](31-definicao-operacional-gmv.md)) permanece para **linguagem comercial e eventual apuração manual** — não para hard cap no app.

## Rejeitado nesta rodada

- Soft meter GMV vs R$ 15k no painel (proposta anterior do grilling).  
- Hard block / overage automático.
