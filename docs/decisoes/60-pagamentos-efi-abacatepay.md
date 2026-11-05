# Decisão: PIX Efí e Crédito Efí (Normal) + AbacatePay (Rápido)

**Data:** 2026-11-04 · **Status:** decidido · **Sessão:** pivô de pagamentos (perguntas objetivas ao Dono)  
**ADR:** [0007](../adr/0007-efi-abacatepay-provedor-fixo-por-loja.md) · **Depende de:** [59](59-pivo-cloudflare-d1-workers.md)

**Supersede:** ADR [0003](../adr/0003-woovi-pix-asaas-cartao.md); gateways em [06](06-gateways-taxas-e-tiers.md), [24](24-arquitetura-pagamentos.md) e [34](34-meios-pagamento-checkout-mvp.md); providers de Estorno em [39](39-cancelamento-estorno-automatico.md); trilha BaaS Asaas de ADR [0004](../adr/0004-modo-piloto-custodia.md) e [46](46-grilling-homologacao-baas-mei-ltda.md)–[54](54-implicacoes-minimas-modo-baas.md) (**arquivada**); exceção em [43](43-guest-conta-vinculo-pedido.md) para dados do pagador no cartão.

## Decisão

### Meios no checkout (MVP)

| Meio | Provedor | MVP |
| --- | --- | --- |
| PIX online | **Efí** (API Pix, QR dinâmico com `txid`) | Sim |
| Crédito online **à vista** | **Efí** (modo Normal) ou **AbacatePay** (modo Rápido) | Sim |
| Pagamento na entrega | — | Sim, sem cobrança |
| Parcelamento, Débito, Voucher | — | Pós-MVP |

O enum técnico do checkout continua `pix` | `credit` | `on_delivery`.

### Conta e custódia

- Conta **Efí própria do Foode** (segunda conta no mesmo CNPJ, já aberta pelo Dono): aplicação, credenciais, certificado `.p12`, chave Pix aleatória e webhooks **separados do ceremony**.
- Conta AbacatePay do Foode para o modo Rápido.
- O piloto segue em **`pilot_platform`**: o dinheiro entra nas contas da Foode e o **repasse ao lojista é manual** — Ops paga por fora e marca o lançamento como pago no Ledger ([ADR 0004](../adr/0004-modo-piloto-custodia.md), parte de custódia, continua).
- Sem split, sem envio de Pix automático e sem BaaS no MVP. O modo de escala depois do piloto é **decisão aberta**, reavaliada após o piloto.

### Provedor do cartão por Loja

- O provedor do Crédito é **fixo por Loja e definido pela operação Foode** (Ops), não pelo Dono: `efi` (Normal) ou `abacatepay` (Rápido).
- O Consumidor vê apenas "Cartão de crédito".
- Cada cobrança grava o provedor, a taxa comercial e o prazo usados (snapshot).
- **Sem kill switch** no MVP: provedor indisponível deixa o Crédito indisponível naquela Loja até voltar ou até Ops trocar o provedor da Loja.

### Checkout e dados do pagador

- Cartão em **checkout transparente**: formulário Foode (outline, Nunito), número tokenizado no navegador (`payment-token-efi` com o identificador de conta Efí, ou `ctok_` da AbacatePay). Dados de cartão nunca passam pela `api`, logs ou Sentry.
- **Exceção a [43](43-guest-conta-vinculo-pedido.md):** ao escolher Cartão, o Guest informa CPF e e-mail (e data de nascimento quando o provedor exigir — Efí). PIX e Pagamento na entrega seguem só com nome e telefone (+ endereço no Delivery).

### Webhooks e Estorno

- **Efí Pix:** webhook por chave Pix, cadastrado sem mTLS de cliente (o Worker não valida o certificado da Efí) e com segredo na URL (`?hmac=…&ignorar=`); o corpo só aponta o que mudou e o desfecho vem da consulta autenticada por mTLS — padrão do ceremony.
- **Efí cartão:** `notification_url` por cobrança com segredo; a notificação traz só o token e o estado vem de `GET /v1/notification/:token`.
- **AbacatePay:** webhook com verificação de assinatura/segredo conforme a doc vigente.
- Todos: identidade única do evento persistida, entrega `at-least-once`, sem regressão de estado.
- Estorno automático no cancelamento ([39](39-cancelamento-estorno-automatico.md)) continua; os providers passam a ser **Efí** (devolução Pix e estorno de cartão) e **AbacatePay** (refund).

### Taxas

As taxas comerciais ao lojista (antes 1,19% PIX D+1 e 3,29% + R$ 0,79 crédito D+33) **serão redefinidas pelo Dono**. Até lá:

- o código lê taxa, prazo e retenção de uma **tabela versionada por provedor/meio**, nunca de constantes espalhadas;
- prazos e retenções do provedor (ex.: AbacatePay libera parte em D+1 e retém parte por um período) são modelados como **parcelas previstas** no Ledger;
- valores-placeholder nos testes não são números comerciais.

## Painel

- Tela de **Repasses** somente leitura para o Dono (Ticket 14): Pedido, meio, provedor, total, taxa, líquido, previsão, status (previsto/pago) e Estorno. Marcar como pago é ação de Ops.
- O provedor do cartão da Loja aparece só como informação.

## Rejeitado

- Woovi e Asaas como provedores do MVP.
- Custódia com envio de Pix automático (fica para depois do piloto).
- Split Efí para conta do lojista no MVP.
- Dono escolhendo Rápido/Normal no MVP; kill switch de provedor.
- Parcelamento no MVP.
- Checkout hospedado (redirect) para cartão.
- Pedir CPF/e-mail a todo Guest.
- Reaproveitar a conta Efí do ceremony.
