# Decisão: timezone e períodos de funcionamento da Loja no MVP

**Data:** jul/2026 · **Status:** decidido · **Sessão:** gate temporal Ticket 07
**Depende de:** [41](41-loja-fechada-pause-checkout.md)

## Decisão

- Todas as Lojas usam o timezone IANA fixo `America/Sao_Paulo`.
- Períodos são informados e persistidos como horário civil local `HH:MM` nesse fuso.
- Cálculos de estado e próxima abertura usam a TZDB IANA, inclusive regras históricas e futuras de DST. O offset UTC−3 não é uma substituição válida para o ZoneId.
- O MVP não possui timezone configurável por Loja.
- Cada período pertence a um único dia civil e exige `início < fim`.
- Períodos com `início >= fim` são rejeitados atomicamente, sem persistência parcial.

## Rejeitado

- Offset UTC fixo no lugar de `America/Sao_Paulo`.
- Campo ou configuração de timezone por Loja no MVP.
- Período overnight pertencente ao dia inicial.
- Usar `23:59` ou `00:00` como workaround implícito para atravessar a meia-noite.

## Impacto

- Complementa a decisão [41](41-loja-fechada-pause-checkout.md).
- Orienta schema, API, projeção pública e testes do Ticket [07](../../.scratch/mvp-foode-delivery/issues/07-horarios-pausa-canal-proprio.md).
