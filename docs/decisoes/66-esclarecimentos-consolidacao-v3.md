# 66 — Esclarecimentos da consolidação v3 da documentação

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Esclarece:** [43](43-guest-conta-vinculo-pedido.md), [45](45-cupom-conta-e-fidelidade-pos-mvp.md), [63](63-decisoes-ux-benchmark-anota.md), [64](64-revisao-adversarial-escopo-mvp.md), [65](65-login-consumidor-codigo-whatsapp.md)

Contradições achadas ao consolidar os tickets com 63–65 (lista em [`conflitos-docs.md`](../../.scratch/mvp-foode-delivery/orquestracao/conflitos-docs.md)), que a regra "a decisão mais nova vence" não resolvia.

## Decisão

### C1 — Cupom de boas-vindas é de primeira compra por Loja

- Com a conta única na Foode ([65](65-login-consumidor-codigo-whatsapp.md)), o Cupom de boas-vindas de uma Loja só é emitido se a conta **não tem nenhum Pedido naquela Loja**. Pedidos Guest vinculados pelo telefone verificado contam e bloqueiam a emissão.
- O Cupom vale uma vez por conta por Loja. Substitui o "ao criar conta" de [43](43-guest-conta-vinculo-pedido.md)/[45](45-cupom-conta-e-fidelidade-pos-mvp.md).

### C2 — Suporte ao Consumidor pelo mesmo widget de chat

- O suporte ao Consumidor bloqueado por conflito de telefone/CPF ([65](65-login-consumidor-codigo-whatsapp.md)) é o **mesmo widget de suporte**: um chatbot automatizado pelo agente do agentes.chat, conectado por MCP ([63](63-decisoes-ux-benchmark-anota.md) P-ONB-5, [64](64-revisao-adversarial-escopo-mvp.md)).
- O espaço do widget existe no **Storefront e no Painel**, desligado sem configuração, com a mesma base de integração (ponto de montagem, contrato de configuração e documento de integração).
- Com o widget ativo, a mensagem de conflito orienta: "Fale com o suporte Foode pelo chat".
- Continua sem link `wa.me` de suporte (64).
- **Risco aceito:** enquanto o widget estiver desligado, o Consumidor bloqueado não tem canal. O risco vale até a ativação do widget, que fica no bloco humano final do Ticket 30.

### C3 — Glossário atualizado

- `CONTEXT.md` atualiza as definições de **Pausa** e **Operador** (o Operador ativa e retoma a Pausa, P-OPE-4) e de **Débito online** e **Crédito online** (estado das decisões [60](60-pagamentos-efi-abacatepay.md)/[61](61-monetizacao-faixas-taxas-anota.md)).

### Planejamento confirmado

- O tour de 3 passos (P-ONB-1) sai do Ticket 28 e vai para o 24b, onde nasce a fila.

## Consequências

- Os Tickets 13, 28 e 30, a spec v3 e o `CONTEXT.md` foram ajustados no mesmo commit.
