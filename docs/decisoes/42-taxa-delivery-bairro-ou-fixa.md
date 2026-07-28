# Decisão: taxa de delivery MVP (bairro ou fixa)

**Data:** jul/2026 · **Status:** decidido · **Sessão:** grilling lacunas #H  
**Depende de:** [08](08-fulfillment-delivery-e-retirada.md) · **Supersede parcial:** “por bairro e/ou por km” no MVP

## Decisão (MVP)

O dono escolhe **um** modo de taxa de delivery por loja:

| Modo | MVP |
| --- | --- |
| **Por bairro** | Lista de bairros + preço por bairro |
| **Taxa fixa** | Um valor único de entrega |
| **Km / raio** | **Pós-MVP** (geocoding / Maps) |

- Endereço do consumidor **fora** das zonas (modo bairro) → delivery **não** permitido (pode oferecer retirada se ativa).  
- Retirada no balcão continua opcional ([08](08-fulfillment-delivery-e-retirada.md)).

## Pós-MVP (registrado)

Taxa por **km / raio** (e combinação eventual com bairro) — só após validar piloto local sem geocoding.

## Rejeitado no MVP

- Km/raio no dia 1.  
- Dois modos ativos ao mesmo tempo na mesma loja.
