# Grilling (grill-with-docs) — lacunas e contrapontos

**Data:** jul/2026 · **Status:** rodada em andamento · **Último fechamento:** D → [38](38-rbac-dono-operador-mvp.md)  
**Glossário:** [`CONTEXT.md`](../../CONTEXT.md)

## Fechado nesta sessão

A [31] · Comercial [32] · N [33] · O [34] · P [35] · B [36] · C [37] · **D [38]**

## Mapa restante

| # | Tema | Tipo |
| --- | --- | --- |
| **E** | Cancelamento + estorno piloto | Lacuna |
| F | Marketing no `web` | Lacuna leve |
| G | Loja fechada / horário | Lacuna |
| H | Frete: bairro (não km) | Lacuna / contraponto |
| I | Guest → conta | Lacuna |
| J | Sem staging | Contraponto |
| K | Fidelidade MVP | Lacuna |
| M | Homologação BaaS | Comercial |

---

## Rodada atual — próxima pergunta: **E**

### E) Cancelamento + estorno no piloto (`pilot_platform`)?

**Contexto:** Status **Cancelado** existe ([09](09-ciclo-pedido-status.md)); estorno self-service fora ([24](24-arquitetura-pagamentos.md)). No piloto o dinheiro passa pelas contas Foode.

**Recomendação:**

1. Lojista (dono **ou** operador) cancela → pedido `cancelled`.  
2. Se pagamento online **já confirmado** → ledger `refund_needed`.  
3. Estorno = **manual** no painel Woovi/Asaas do founder + marcar `refunded`.  
4. Se cobrança **ainda pendente** → cancelar via API se possível; senão deixar expirar.  
5. Pagamento na entrega: só status, sem ledger de gateway.  
6. Sem UI de “estornar” no admin no MVP.

---

## Fila

**F** marketing no `web` · **G** fechado = checkout bloqueado · **H** frete bairro/fixa · **I** guest→conta · **J** sem staging · **K** fidelidade simples.

## Próximo passo

Founder responde **E**.
