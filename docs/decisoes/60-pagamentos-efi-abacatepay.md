# Decisão: PIX AbacatePay; Crédito Efí (Normal) ou AbacatePay (Rápido); custódia com repasse D+1 útil

**Data:** 2026-11-04 (revisada no mesmo dia) · **Status:** decidido · **Sessão:** pivô de pagamentos + benchmark Anota AI  
**ADR:** [0007](../adr/0007-efi-abacatepay-provedor-fixo-por-loja.md) · **Depende de:** [59](59-pivo-cloudflare-d1-workers.md) · **Monetização:** [61](61-monetizacao-faixas-taxas-anota.md)

**Supersede:** ADR [0003](../adr/0003-woovi-pix-asaas-cartao.md); gateways em [06](06-gateways-taxas-e-tiers.md), [24](24-arquitetura-pagamentos.md) e [34](34-meios-pagamento-checkout-mvp.md); providers de Estorno em [39](39-cancelamento-estorno-automatico.md); trilha BaaS Asaas de ADR [0004](../adr/0004-modo-piloto-custodia.md) e [46](46-grilling-homologacao-baas-mei-ltda.md)–[54](54-implicacoes-minimas-modo-baas.md) (**arquivada**); exceção em [43](43-guest-conta-vinculo-pedido.md) para dados do pagador no cartão.

## Decisão

### Meios no checkout

| Meio | Provedor | Observação |
| --- | --- | --- |
| PIX online | **AbacatePay** (QR dinâmico + copia-e-cola, checkout transparente) | Custo atual R$ 0,54 por recebimento; saldo disponível na hora |
| Crédito à vista — **Normal** | **Efí** (API de Cobranças, `payment_token` gerado no navegador; sem mTLS) | Custo atual 3,49%; liberação em até 21 dias úteis |
| Crédito à vista — **Rápido** | **AbacatePay** (cartão transparente, `ctok_`) | Custo atual 5,42% + R$ 0,60; liberação em até 1 dia útil |
| Pagamento na entrega | — | Sem cobrança, sem Ledger |
| Parcelamento, antecipação própria, boleto | — | Fora |
| Débito online e carteiras | — | **Avaliar no Ticket 27**: entra só se Efí ou AbacatePay suportarem no checkout transparente |

Os custos acima são **custos do provedor para a Foode** (informação de Ops, nunca exibida ao lojista) e ficam numa tabela de custos editável no `/ops`, para apurar margem. O enum técnico do checkout continua `pix` | `credit` | `on_delivery`.

### Contas e custódia

- **Uma conta Efí do Foode** (segunda conta no mesmo CNPJ, separada do ceremony) e **uma conta AbacatePay do Foode**. Nada de conta de provedor por Loja, split ou envio automático de Pix.
- Todas as Lojas operam em **`pilot_platform`**: o dinheiro entra nas contas da Foode e o repasse ao lojista é **manual**, registrado no **Ledger interno**.
- O app suporta **várias Lojas** desde já (não há trava de "um Comerciante-modelo"); quantas Lojas entram é decisão comercial.

### Modo do cartão por Loja

- O lojista contrata **Normal** (taxa menor, prazo maior) ou **Rápido** (taxa maior, D+1); o Ops configura o modo na Loja conforme o contrato. O Consumidor vê só "Cartão de crédito".
- Cada cobrança grava provedor, modo, taxa Foode, custo do provedor e prazos efetivos (snapshot). Trocar o modo da Loja não reescreve cobranças anteriores.
- Sem kill switch: provedor indisponível deixa o meio indisponível na Loja.

### Repasse (Ledger interno)

- Cada pagamento online confirmado gera lançamento com: Pedido, meio, provedor, total, taxa Foode, líquido, **data de liberação no provedor** e **data prevista de repasse = 1º dia útil após a liberação** (PIX: D+1 útil; Rápido: D+1 útil após liberar; Normal: D+1 útil após a Efí liberar). Retenção do provedor, se houver, vira parcela prevista separada.
- **Lote diário**: todo dia útil o `/ops` mostra, por Loja, o total "a repassar hoje", a chave Pix de repasse cadastrada da Loja e os lançamentos do lote. O Ops faz um Pix por Loja por fora e marca o lote como pago (data, conta de saída, identificador/comprovante, custo do envio).
- Estorno antes do repasse abate o lançamento; estorno depois do repasse gera débito compensado nos lotes seguintes.
- O Dono vê a tela **Repasses** (só leitura): lançamentos, lotes, previsto x pago.

### Checkout e dados do pagador

- Formulário próprio no visual Foode; dados de cartão tokenizados no navegador e nunca enviados à `api`, logs ou Sentry.
- **Exceção a [43](43-guest-conta-vinculo-pedido.md):** ao escolher Cartão, o Guest informa CPF e e-mail (e data de nascimento se o provedor exigir). PIX e Pagamento na entrega seguem só com nome e telefone (+ endereço no Delivery). Se a AbacatePay exigir CPF no PIX, o campo aparece só no PIX.
- Meio online sem **taxa Foode vigente** cadastrada para a Loja fica indisponível no checkout ([61](61-monetizacao-faixas-taxas-anota.md)).

### Webhooks e Estorno

- **AbacatePay:** webhook com verificação de assinatura/segredo conforme a doc vigente; desfecho conferido por consulta autenticada quando o corpo não bastar.
- **Efí cobrança:** `notification_url` por cobrança com segredo (`?secret=`); a notificação traz só o token e o estado vem de `GET /v1/notification/:token`.
- Identidade única do evento persistida; entrega `at-least-once` e fora de ordem sem regressão. URLs com segredo e corpos nunca vão a log ou Sentry.
- Estorno automático no cancelamento ([39](39-cancelamento-estorno-automatico.md)): PIX e Rápido pela AbacatePay; Normal pela Efí.

## Rejeitado

- Woovi e Asaas; PIX pela Efí (mais caro acima de ~R$ 45 e exigiria mTLS); conta de provedor por Loja; split; envio de Pix automático; D+7 antecipado com caixa da Foode; kill switch; parcelamento; checkout hospedado; pedir CPF/e-mail a todo Guest; reaproveitar a conta Efí do ceremony.
