// FAQ pública (PROPOSTA-LANDING §2.11 + FAQ de planos do Anota adaptada). As mesmas perguntas
// aparecem na página e no JSON-LD `FAQPage` (o Google exige correspondência). Nada de tarifa
// de serviço do Consumidor aqui (decisão 71: só nos termos).

export type FaqItem = { question: string; answer: string };

export const FAQ: readonly FaqItem[] = [
  {
    question: "Tem taxa por pedido?",
    answer:
      "Não. Você paga uma mensalidade por faixa de pedidos do mês e nada por pedido. Só o pagamento online (PIX e cartão) tem uma taxa por transação, combinada no cadastro da sua loja. Pagamento na entrega não tem taxa.",
  },
  {
    question: "Preciso sair do iFood ou de outro marketplace?",
    answer:
      "Não. A Foode é o canal do seu cliente recorrente: quem já conhece você pede pelo seu link, sem comissão. O marketplace continua trazendo cliente novo.",
  },
  {
    question: "Meu cliente precisa instalar app ou criar conta?",
    answer:
      "Não. O cardápio abre no navegador do celular e o pedido é feito como visitante, com nome e WhatsApp. Conta é opcional.",
  },
  {
    question: "Como recebo o dinheiro do PIX e do cartão?",
    answer:
      "Em lote diário por loja, 1 dia útil depois da liberação do provedor de pagamento, com extrato no painel. No modo Rápido do cartão, o valor fica disponível em D+1 com uma taxa diferente.",
  },
  {
    question: "Preciso de computador?",
    answer:
      "Não. O painel e o cardápio funcionam no celular. Para imprimir o pedido, basta um navegador ligado a uma impressora térmica de 80 mm.",
  },
  {
    question: "Tem fidelidade ou multa?",
    answer: "Não. Sem fidelidade e sem multa. Você cancela quando quiser.",
  },
  {
    question: "Tem teste grátis?",
    answer:
      "Não. Em vez de um teste sem acompanhamento, você tem reembolso integral em até 7 dias: se não fizer sentido para a sua loja, devolvemos o valor pago.",
  },
  {
    question: "Como funciona o cadastro?",
    answer:
      "Você fala com a Foode, a equipe cria a sua loja e envia o convite. Você monta o cardápio (ou envia o que já tem) e recebe o link e o QR Code para divulgar.",
  },
  {
    question: "Como pago a mensalidade?",
    answer:
      "A cobrança é feita fora do app, por PIX ou cartão, e a loja é ativada depois do pagamento. O plano anual pode ser parcelado em até 6 vezes.",
  },
  {
    question: "Posso usar meu próprio domínio?",
    answer:
      "Hoje a sua loja fica em foodedelivery.com.br/loja/sua-loja, com um link personalizado que você escolhe e um QR Code pronto para imprimir.",
  },
];
