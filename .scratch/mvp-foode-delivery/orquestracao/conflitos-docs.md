# Conflitos de documentação — consolidação v3 (2026-11-05)

Contradições ou lacunas que a regra "a decisão mais nova vence" não resolve. **Resolvidos pelo Dono em 2026-11-05 na [decisão 66](../../../docs/decisoes/66-esclarecimentos-consolidacao-v3.md):** C1 → Cupom de boas-vindas de primeira compra por Loja (Pedido Guest vinculado bloqueia; uso único por conta por Loja); C2 → nenhuma das opções: o suporte é o mesmo widget de chat (agentes.chat + MCP), com espaço também no Storefront, e sem widget ativo não há canal (risco aceito); C3 → opção A. O registro abaixo fica como histórico.

## C1 — Cupom de boas-vindas com conta única na Foode

- **Decisões:** [43](../../../docs/decisoes/43-guest-conta-vinculo-pedido.md)/[45](../../../docs/decisoes/45-cupom-conta-e-fidelidade-pos-mvp.md) (Cupom emitido "ao criar conta", com o programa da Loja ativo) × [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md) (conta única na Foode, válida em qualquer Loja; Cupom de boas-vindas separado por Loja).
- **Impacto:** a conta é criada uma vez só, numa Loja. Não está definido se o Consumidor recebe o Cupom de boas-vindas de outra Loja onde também entra depois. Afeta o Ticket 13 (regra de emissão e unicidade) e o Ticket 14 (contagem de uso).
- **Opções:**
  - **A (recomendada):** emitir na primeira vez que a conta entra em cada Loja com o programa ativo, um Cupom por conta por Loja, de uso único.
  - B: emitir só na Loja onde a conta foi criada.
  - C: emitir em cada Loja só se a conta ainda não tem Pedido nessa Loja (Pedidos Guest vinculados contam), ou seja, um Cupom de primeira compra.

## C2 — Canal de suporte Foode para o Consumidor em conflito de conta

- **Decisões:** [65](../../../docs/decisoes/65-login-consumidor-codigo-whatsapp.md) (conflito de telefone/CPF "bloqueia e orienta o suporte Foode"; troca de número só pelo Ops) × [64](../../../docs/decisoes/64-revisao-adversarial-escopo-mvp.md) (sem link `wa.me` de suporte; o widget de suporte é do Painel e fica desligado sem configuração).
- **Impacto:** o Consumidor bloqueado não tem canal definido para chegar ao Ops. Afeta a mensagem de conflito do Ticket 13 e o runbook do Ticket 30.
- **Opções:**
  - **A (recomendada):** mostrar um e-mail de suporte fixo da Foode na mensagem de conflito (endereço a criar no domínio, por exemplo `suporte@foodedelivery.com.br`), recebido pelo Ops.
  - B: orientar o Consumidor a falar com a Loja (o `wa.me` da Loja já existe), e a Loja aciona o Ops.
  - C: link `wa.me` do número oficial da Foode só nessa mensagem, como exceção à 64.

## C3 — CONTEXT.md desatualizado em termos já existentes

- **Decisões:** [63](../../../docs/decisoes/63-decisoes-ux-benchmark-anota.md) P-OPE-4 (o Operador ativa e retoma a Pausa) × `CONTEXT.md`, onde "Pausa" é "Toggle do dono" e "Operador" tem acesso "somente a pedidos/status". A instrução desta consolidação era acrescentar termos sem mudar os existentes. Além disso, "Débito online" está como "Fora do MVP" (a 60 manda avaliar no Ticket 27) e "Crédito online" está com "taxa e prazo a redefinir" (a 60/61 já definiram).
- **Impacto:** o agente que lê o glossário pode negar a Pausa ao Operador, contra a P-OPE-4 e o critério do 24b.
- **Opções:**
  - **A (recomendada):** atualizar no `CONTEXT.md` as definições de Pausa, Operador, Débito online e Crédito online para o estado das decisões 60–63.
  - B: manter as definições e acrescentar a cada uma uma nota "alterado por P-OPE-4 / decisão 60" com link.

## Ajustes de planejamento feitos na consolidação (não precisam de decisão)

- O tour de 3 passos (P-ONB-1, atribuído ao 28 pela decisão 63) foi para o 24b, porque a fila nasce no 24b e o 28 roda antes, em paralelo ao 24a.
- PED-09 e ONB-03 das diretrizes (sem tour, sem perguntas de perfil) cedem às decisões P-ONB-1 e P-ONB-4, porque a 63 diz que as diretrizes valem só onde não conflitam com ela.
- O critério de remoção do Ticket 25 continua citando Fastify, Prisma, Supabase, Woovi e Railway, porque ele trata justamente da limpeza deles.
