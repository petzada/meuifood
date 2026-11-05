# 71 — Tarifa de serviço do pagamento online, pagamento do Consumidor à vista e parcelamento do Anual

**Data:** 2026-11-05 · **Status:** aceita · **Decidido por:** Dono · **Complementa:** [60](60-pagamentos-efi-abacatepay.md), [61](61-monetizacao-faixas-taxas-anota.md), [70](70-landing-paginas-publicas-seo.md)

## Consumidor

- Pagamento online só **à vista (1×) no Cartão de crédito ou PIX**; sem parcelamento para o Consumidor.
- **Tarifa de serviço de R$ 1,50 por Pedido pago online (PIX ou Cartão)**, cobrada do Consumidor:
  - calculada no servidor **depois** de itens, Complementos, Adicionais, Delivery e Cupom; o Cupom não incide sobre ela e ela não entra na base da taxa Foode por meio de pagamento;
  - exibida **somente no checkout, na última etapa**, como linha própria junto da taxa de entrega, e no comprovante/acompanhamento/detalhe do Pedido;
  - fica **inteiramente com a Foode**: no Ledger é receita da Foode e **nunca** entra no líquido nem no repasse do lojista;
  - **Pagamento na entrega não tem tarifa**; Estorno total devolve também a tarifa;
  - valor fixo em `@foode/shared` (centavos), não configurável no app.
- **Não é divulgada** na landing nem nos planos; aparece só nos **termos** e no **checkout** do Consumidor.

## Lojista — plano Anual

- O lojista pode **parcelar o Anual em até 6×** com **juros de 2,99% por parcela** (Tabela Price, ao mês): `parcela = PV × i / (1 − (1 + i)^−n)`, com PV = R$ 1.019,88, i = 2,99%, n = 6 → **6× de R$ 188,20** (total parcelado R$ 1.129,23). O valor é calculado a partir das constantes de preço, nunca fixado à mão.
- Card do Anual na landing e em `/precos`: **destaque "6× de R$ 188,20"** e, abaixo, sem destaque, o total à vista **R$ 1.019,88/ano**; a badge de desconto do card continua dando o destaque do desconto (substitui o "12× R$ 84,99" da decisão 70).
- **Esclarecimento ([74](74-padrao-cadastro-modal.md), Dono, 2026-11-05):** o Anual **não tem teto de Pedidos** — é o plano mais completo — e custa a **faixa básica × 12** (R$ 84,99 × 12 = **R$ 1.019,88**), pagável em até 6× com 2,99% a.m. como acima. A badge "66%" da landing compara o Anual com 12 mensalidades da **faixa mais alta** do Mensal (a única que também não limita Pedidos) e está **correta**.
- A cobrança da assinatura segue **fora do app** (61); o parcelamento entra nos `/termos` e na implementação futura de cobrança da assinatura.

## Conta do Consumidor após o Pedido

- Na página de acompanhamento, Consumidor não logado vê um card discreto para **criar conta pelo WhatsApp** com o telefone do Pedido; ao concluir, o Pedido é vinculado (65/66). Sem login disponível, o card não aparece. Implementação no Ticket 26 (mesma página do QR).

## Tickets afetados

26 (tarifa no PIX, Ledger, oferta de conta), 27 (tarifa no Cartão), 12 (Estorno inclui a tarifa), 14 (receita da Foode separada do repasse nos relatórios/lotes), 31 (card do Anual em 6×; tarifa só nos termos).
