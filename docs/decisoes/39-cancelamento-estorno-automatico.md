# Decisão: cancelamento com estorno automático (PIX/crédito)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #E  
**Depende de:** [09](09-ciclo-pedido-status.md), [24](24-arquitetura-pagamentos.md), [34](34-meios-pagamento-checkout-mvp.md)  
**Supersede:** “estorno manual no painel do gateway no piloto” em [24](24-arquitetura-pagamentos.md) e nota de estorno pós-MVP em [pesquisa 12](../pesquisa/12-stack-pagamentos-infra-integracoes.md)

## Decisão

Ao cancelar um pedido no painel (dono **ou** operador):

| Situação do pagamento | Ação |
| --- | --- |
| **PIX já pago** (Woovi) | Estorno **automático via API** Woovi |
| **Crédito já pago** (Asaas) | Estorno **automático via API** Asaas |
| **PIX/crédito ainda pendente** | Cancelar/expirar cobrança via API do provider (se suportado); senão aguardar expiração + pedido `cancelled` |
| **Pagamento na entrega** | **Só** status `cancelled` — sem ledger de gateway / sem estorno Foode |

Sem botão separado de “estornar”: o cancelamento do pedido **dispara** o fluxo de refund quando houver charge pago.

## Providers (docs oficiais)

| Gateway | Ação | Referência |
| --- | --- | --- |
| **Woovi** | `POST /api/v1/charge/{correlationID}/refund` — body com `correlationID` de **idempotência** do refund (+ `value` opcional em centavos; omitir = total/restante) | [Charge refund API](https://developers.woovi.com/docs/refund/charge-refund-create-api) |
| **Asaas** | `POST /v3/payments/{id}/refund` — body opcional (`value`, `description`); full refund se omitir valor | [Refund payment](https://docs.asaas.com/reference/refund-payment) · conciliação via array `refunds` (`PENDING` → `DONE`) — [Estornos](https://docs.asaas.com/docs/estornos) |

## Fluxo na `api`

1. Pedido → `cancelled`.  
2. Se charge online **pago** → chamar refund do provider com **idempotency key** estável (`order_id` + tentativa).  
3. Ledger: `refund_requested` → (webhook/`refunds`) → `refunded` ou `refund_failed`.  
4. Webhooks Woovi/Asaas atualizam status final (at-least-once + tabela de eventos já prevista).  
5. Falha de API: manter `refund_failed` + alerta (Sentry); retry/reconciliação via Cron existente — **não** exigir clique manual no painel do gateway como caminho feliz.

## Escopo MVP

- Estorno **total** do pedido cancelado (não partial de item).  
- UI admin: cancelar pedido; feedback “estorno em andamento / concluído / falhou”.  
- Partial refund / estorno sem cancelar pedido = fora do MVP.

## Rejeitado nesta rodada

- Estorno só manual no dashboard Woovi/Asaas como caminho principal do piloto.
