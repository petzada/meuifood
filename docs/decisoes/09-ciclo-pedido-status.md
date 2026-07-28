# Decisão: ciclo de vida do pedido (MVP)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling #9

## Fluxo do consumidor

1. Acessa a **página/link do comerciante**.
2. Monta o pedido no cardápio (web mobile-first).
3. Escolhe fulfillment (delivery ou retirada, se ativa).
4. Paga **online** (PIX/cartão conforme tier/meios da loja) **ou** escolhe **pagamento na entrega**.

## Status no painel lojista (enxuto)

| Status | Quem move | Efeito |
| --- | --- | --- |
| **Recebido** | Sistema (novo pedido) | Lojista vê e decide seguir |
| **Em preparo** | Lojista | Reflete no perfil/acompanhamento do cliente |
| **Saiu para entrega** *ou* **Pronto para retirada** | Lojista | Conforme modalidade do pedido |
| **Concluído** | Lojista (manual no MVP) | Fecha o ciclo |
| **Cancelado** | Lojista (dono ou operador) | Encerra; se PIX/crédito pago → estorno automático ([39](39-cancelamento-estorno-automatico.md)); na entrega = só status |

## Conclusão automática

- **MVP:** conclusão **manual** pelo lojista.
- **Pós-MVP:** estudar conclusão automática (ex.: timer baseado em ETA / km de entrega) como alternativa — **não** implementar agora.

## Pós-MVP (registrado, fora do escopo atual)

| Item | Nota |
| --- | --- |
| Notificação WhatsApp ao mudar status | Bot/provedor — alinhado a [07](07-canal-consumidor-web-mobile-first.md); MVP usa só `wa.me` |
| Integração com **iFood** | Consolidar/estudar pedidos do marketplace no mesmo painel — **pós-MVP** |
| Auto-conclusão por tempo/km | Ver acima |

## Fora do MVP

- Status ricos (“entregador a caminho”, mapa, atribuição de frota).
- Dependência de logística iFood no go-live.
