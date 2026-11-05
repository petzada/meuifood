// Páginas de segmento `/para/[segmento]` (decisão 70): seis nichos, conteúdo próprio por
// página (≥ 40% diferente entre si; PROPOSTA-SEO §5). TEXTO PROVISÓRIO: revisão do Dono.

export type Segment = {
  slug: string;
  /** Nome curto do nicho (chips, nav). */
  name: string;
  /** `<title>` sem o sufixo do site. */
  title: string;
  description: string;
  h1: string;
  intro: string;
  /** Dores específicas do nicho, na linguagem do lojista. */
  pains: readonly string[];
  /** Como a Foode resolve, com funcionalidades reais (decisões 60–63). */
  solutions: readonly { title: string; text: string }[];
  /** Exemplo para a calculadora: pedidos/mês, ticket médio em centavos. */
  example: { ordersPerMonth: number; averageTicketCents: number };
  faq: readonly { question: string; answer: string }[];
};

export const SEGMENTS: readonly Segment[] = [
  {
    slug: "hamburgueria",
    name: "Hamburgueria",
    title: "Cardápio digital para hamburgueria sem comissão",
    description:
      "Cardápio digital com ponto da carne, pão, molhos e adicionais, checkout com PIX e cartão e fila de pedidos para a sua hamburgueria. Mensalidade fixa, sem comissão.",
    h1: "Cardápio digital para hamburgueria, sem comissão por pedido",
    intro:
      "Hamburgueria vive de combo, adicional e cliente que volta toda semana. Cada pedido desse cliente no marketplace paga comissão de novo. Com o seu link, o pedido recorrente é seu.",
    pains: [
      "Bacon, ovo e queijo extra anotados errado no WhatsApp e a cozinha refaz o lanche.",
      "Ponto da carne e troca de pão viram áudio de 40 segundos para decifrar.",
      "Na sexta à noite os pedidos chegam todos juntos e alguém esquece de confirmar.",
    ],
    solutions: [
      {
        title: "Complementos e adicionais por item",
        text: "Grupos obrigatórios (ponto da carne, pão) e opcionais (molhos), adicionais com preço, limite de escolhas e “copiar grupos de outro item” para montar o cardápio rápido.",
      },
      {
        title: "Fila com som e impressão",
        text: "Cada pedido novo toca no painel, entra na fila com chip de delivery ou retirada e imprime em 80 mm ao aceitar. Cancelou? O estorno do pagamento online é automático.",
      },
      {
        title: "Cupom de boas-vindas",
        text: "Cupom por código, em % ou R$, com dias da semana e limite de usos, para puxar o cliente do marketplace para o seu link.",
      },
    ],
    example: { ordersPerMonth: 300, averageTicketCents: 5500 },
    faq: [
      {
        question: "Dá para montar combos?",
        answer:
          "Sim: um item com grupos de complementos (lanche, acompanhamento, bebida) funciona como combo, com preço por opção quando precisar.",
      },
      {
        question: "O cliente escolhe o ponto da carne?",
        answer:
          "Sim, num grupo obrigatório de escolha única. O pedido chega para a cozinha com tudo discriminado.",
      },
    ],
  },
  {
    slug: "pizzaria",
    name: "Pizzaria",
    title: "Cardápio digital para pizzaria sem comissão",
    description:
      "Pizzaria com sabores, tamanhos e bordas no cardápio digital, pedido pelo link, PIX e cartão online e entrega por bairro. Mensalidade por faixa de pedidos, sem comissão.",
    h1: "Cardápio digital para pizzaria, com sabores e bordas no lugar certo",
    intro:
      "A pizzaria tem o ticket mais alto do delivery e o cliente mais fiel: a família que pede toda semana. É justamente nesse pedido que a comissão pesa mais. No seu link, ele sai sem comissão.",
    pains: [
      "Meia a meia, borda recheada e tamanho da pizza viram conversa longa no WhatsApp.",
      "Taxa de entrega diferente por bairro e o atendente erra o valor na correria.",
      "O cliente pergunta “já saiu?” e ninguém tem tempo de responder.",
    ],
    solutions: [
      {
        title: "Tamanhos, bordas e sabores como complementos",
        text: "Grupos com mínimo e máximo de escolhas (até dois sabores, uma borda), preço por opção e disponibilidade por item quando acaba um ingrediente.",
      },
      {
        title: "Entrega por bairro ou taxa fixa",
        text: "Tabela de bairros com taxa própria ou taxa única, pedido mínimo e retirada no balcão. O CEP preenche o endereço e o valor da entrega aparece antes de pagar.",
      },
      {
        title: "Aviso no WhatsApp com acompanhamento",
        text: "O cliente recebe o link de acompanhamento do pedido e vê quando saiu para entrega. Menos “cadê meu pedido?” no seu telefone.",
      },
    ],
    example: { ordersPerMonth: 250, averageTicketCents: 8500 },
    faq: [
      {
        question: "Funciona pizza meio a meio?",
        answer:
          "Sim: um grupo de sabores com máximo de 2 escolhas resolve o meio a meio, com o preço do sabor mais caro ou por opção, como você configurar.",
      },
      {
        question: "Posso cobrar entrega diferente por bairro?",
        answer: "Sim, com uma tabela de bairros e taxas, ou uma taxa fixa para toda a área.",
      },
    ],
  },
  {
    slug: "marmitaria",
    name: "Marmitaria",
    title: "Cardápio digital para marmitaria sem comissão",
    description:
      "Marmitaria com cardápio do dia, tamanhos e acompanhamentos, pedidos pelo link antes do almoço e pagamento online. Mensalidade fixa, sem comissão por marmita.",
    h1: "Cardápio digital para marmitaria: pedidos antes do almoço, sem comissão",
    intro:
      "Marmitaria tem ticket baixo e volume alto. Uma comissão por pedido come a margem de cada marmita. A Foode cobra uma mensalidade por faixa de pedidos, então quanto mais marmita, menos pesa.",
    pains: [
      "O cardápio do dia muda toda manhã e precisa ser avisado para todo mundo.",
      "Dezenas de pedidos chegam entre 10h e 11h30 e o WhatsApp trava.",
      "Cliente da empresa pede para cinco pessoas e cada uma quer um acompanhamento.",
    ],
    solutions: [
      {
        title: "Disponibilidade por item em um toque",
        text: "Acabou o frango? Marque indisponível no painel e some do cardápio na hora. Destaques do dia aparecem no topo do link.",
      },
      {
        title: "Horário de funcionamento e pedido mínimo",
        text: "A loja abre e fecha sozinha no horário que você define; fora dele o cliente vê quando abre. Pedido mínimo para delivery.",
      },
      {
        title: "Relatórios por dia da semana",
        text: "Top itens por dia da semana e funil visita → pedido para planejar quanto preparar na segunda e na sexta.",
      },
    ],
    example: { ordersPerMonth: 600, averageTicketCents: 2500 },
    faq: [
      {
        question: "Dá para aceitar pedido só até certo horário?",
        answer:
          "Sim. Com o horário de funcionamento, a loja fecha automaticamente e o link avisa quando volta a abrir.",
      },
      {
        question: "O cliente pode pagar na entrega?",
        answer: "Sim, com “troco para” informado no checkout. Pagamento na entrega não tem taxa.",
      },
    ],
  },
  {
    slug: "acai",
    name: "Açaí e sorvetes",
    title: "Cardápio digital para açaí e sorveteria sem comissão",
    description:
      "Açaí com tamanhos, caldas e complementos ilimitados no cardápio digital, pedido pelo link e pagamento online. Mensalidade por faixa de pedidos, sem comissão.",
    h1: "Cardápio digital para açaí, com os complementos do jeito que o cliente quer",
    intro:
      "No açaí o cliente escolhe muito: tamanho, calda, granola, frutas, extras. É o cardápio que mais erra no WhatsApp e o que mais ganha com um link onde ele monta o copo sozinho.",
    pains: [
      "Lista de complementos enorme e cliente esquecendo de dizer o tamanho.",
      "Adicional pago (Nutella, leite ninho) que sai sem cobrar.",
      "Pico no fim de semana à tarde e pedidos repetidos por engano.",
    ],
    solutions: [
      {
        title: "Grupos com limite de escolhas",
        text: "Tamanho obrigatório, complementos grátis com máximo de itens e adicionais pagos com preço próprio. O total aparece antes de fechar.",
      },
      {
        title: "Checkout em uma tela",
        text: "Carrinho, endereço pelo CEP, forma de pagamento e “troco para” numa tela só. PIX com QR Code e cartão de crédito online.",
      },
      {
        title: "Link personalizado e QR Code",
        text: "Seu link na bio do Instagram e um QR Code na vitrine. O cliente salva e pede de novo sem procurar.",
      },
    ],
    example: { ordersPerMonth: 400, averageTicketCents: 3200 },
    faq: [
      {
        question: "Posso limitar quantos complementos grátis o cliente escolhe?",
        answer: "Sim: cada grupo tem mínimo e máximo de escolhas.",
      },
      {
        question: "Dá para cobrar os adicionais?",
        answer: "Sim, cada adicional tem preço próprio e entra no total do pedido.",
      },
    ],
  },
  {
    slug: "japones",
    name: "Japonês",
    title: "Cardápio digital para restaurante japonês sem comissão",
    description:
      "Combinados, temakis e pratos quentes no cardápio digital com fotos, pedido pelo link, cartão e PIX online e fila de pedidos. Mensalidade fixa, sem comissão por pedido.",
    h1: "Cardápio digital para japonês, com combinados e fotos que vendem",
    intro:
      "Comida japonesa tem ticket alto e cliente exigente: ele quer ver a foto do combinado e escolher a troca. Cada combinado de R$ 120 no marketplace deixa uma comissão grande na mesa.",
    pains: [
      "Combinados com trocas (sem salmão cru, mais hot roll) que o atendente precisa confirmar.",
      "Cliente compara pelo preço do marketplace e desconfia do WhatsApp.",
      "Cartão de crédito só por link de terceiros, sem controle do pedido.",
    ],
    solutions: [
      {
        title: "Fotos e descrições por item",
        text: "Cardápio com foto, descrição e destaques. Busca por nome e categorias para achar o temaki rápido.",
      },
      {
        title: "Cartão de crédito dentro do pedido",
        text: "Cartão online com taxa combinada no cadastro, modo Normal ou Rápido (D+1), e estorno automático se você cancelar.",
      },
      {
        title: "Pixel Meta e Google no seu link",
        text: "Instale o Pixel e acompanhe o funil visita → carrinho → pedido para saber de onde vêm os clientes.",
      },
    ],
    example: { ordersPerMonth: 200, averageTicketCents: 11000 },
    faq: [
      {
        question: "Posso oferecer trocas no combinado?",
        answer: "Sim: um grupo opcional de trocas, com ou sem preço, por item.",
      },
      {
        question: "O cliente paga com cartão sem sair do pedido?",
        answer: "Sim. Cartão de crédito e PIX são pagos no checkout, sem link externo.",
      },
    ],
  },
  {
    slug: "padaria",
    name: "Padaria e confeitaria",
    title: "Cardápio digital para padaria e confeitaria sem comissão",
    description:
      "Encomendas, bolos, salgados e café da manhã no cardápio digital, com retirada no balcão ou entrega, pagamento online e cupons. Mensalidade fixa, sem comissão.",
    h1: "Cardápio digital para padaria e confeitaria, com retirada e entrega",
    intro:
      "Padaria vende o dia inteiro, em itens pequenos e encomendas grandes. O cliente do bairro já conhece você; o que falta é um link para ele pedir sem ligar.",
    pains: [
      "Encomenda de bolo por telefone com detalhe anotado em papel.",
      "Retirada no balcão e entrega misturadas na mesma fila.",
      "Muitos itens de baixo valor e a comissão por pedido não compensa no marketplace.",
    ],
    solutions: [
      {
        title: "Retirada no balcão ou entrega",
        text: "O cliente escolhe retirar ou receber; a fila do painel separa com chips de delivery e retirada.",
      },
      {
        title: "Cardápio por categoria com disponibilidade",
        text: "Pães, salgados, bolos e café da manhã em categorias; item que acabou some do link em um toque.",
      },
      {
        title: "Cupons para dias fracos",
        text: "Cupom válido só na terça e quarta, por exemplo, com limite de usos. Simples de criar no painel.",
      },
    ],
    example: { ordersPerMonth: 350, averageTicketCents: 3800 },
    faq: [
      {
        question: "Serve para encomendas?",
        answer:
          "Sim, como itens do cardápio com complementos (tamanho, recheio). Encomenda com data específica é combinada pelo WhatsApp da loja, que fica no link.",
      },
      {
        question: "Posso ter só retirada, sem entrega?",
        answer: "Sim. Delivery e retirada são configurados separadamente.",
      },
    ],
  },
];

export function findSegment(slug: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}
