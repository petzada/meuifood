# Decisão: loja fechada, horário e pause de emergência

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #G  
**Depende de:** [13](13-cardapio-mvp.md)
**Complementada por:** [58](58-timezone-horarios-loja-mvp.md) — timezone e regras dos períodos

## Decisão

| Estado | Cardápio | Checkout |
| --- | --- | --- |
| Dentro do horário de funcionamento | Visível | Liberado (se não pausado) |
| Fora do horário / fechada | **Visível** (SEO / share) | **Bloqueado** — mensagem com horário de abertura (ex.: “Abre às HH:MM”) |
| **Pausado** (toggle do dono) | Visível | **Bloqueado** — independente do horário (emergência) |

- Horário de funcionamento = config da loja (já no MVP de cardápio).  
- Toggle **pausado** = só **dono** ([38](38-rbac-dono-operador-mvp.md)); operador não altera.  
- Storefront deve deixar claro o motivo do bloqueio (fechado vs pausado).

## Rejeitado

- Esconder o cardápio fora do horário.  
- Permitir pedido “para depois” / agendamento no MVP ([13](13-cardapio-mvp.md) já exclui agendamento).
