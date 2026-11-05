// Blog (decisão 70): posts versionados no repositório, em TS tipado (sem MDX: nenhuma
// dependência nova). Cada post traz resposta direta no topo (GEO/AEO), FAQ estruturado e
// JSON-LD `Article`. TEXTO PROVISÓRIO: marcado para revisão do Dono antes de publicar.
import { FIRST_MONTHLY_TIER, formatBRL, MONTHLY_TIERS } from "./pricing";

export type PostBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: readonly string[] }
  | { type: "table"; head: readonly string[]; rows: readonly (readonly string[])[] };

export type Post = {
  slug: string;
  title: string;
  description: string;
  /** Resposta direta de 2–3 frases (bloco de resposta para IA/snippet). */
  answer: string;
  publishedAt: string;
  updatedAt: string;
  /** Marcado até o Dono revisar. */
  reviewPending: boolean;
  tags: readonly string[];
  blocks: readonly PostBlock[];
  faq: readonly { question: string; answer: string }[];
};

const tier1 = formatBRL(FIRST_MONTHLY_TIER.priceCents);
const tierRows = MONTHLY_TIERS.map((tier) => {
  const faixa =
    tier.maxOrders === null
      ? `Acima de ${tier.minOrders - 1} pedidos`
      : tier.minOrders === 0
        ? `Até ${tier.maxOrders} pedidos`
        : `${tier.minOrders} a ${tier.maxOrders} pedidos`;
  return [faixa, `${formatBRL(tier.priceCents)}/mês`] as const;
});

export const POSTS: readonly Post[] = [
  {
    slug: "cardapio-digital-sem-comissao-comparativo",
    title: "Cardápio digital sem comissão: como comparar plataformas de delivery em 2026",
    description:
      "O que olhar antes de contratar um cardápio digital: mensalidade por faixa, comissão, taxa de PIX e cartão, prazo de recebimento, fidelidade e reembolso. Comparativo neutro com os critérios e o que a Foode oferece.",
    answer:
      "Para comparar cardápios digitais, olhe seis coisas: a mensalidade na sua faixa de pedidos, se há comissão por pedido, a taxa e o prazo do PIX e do cartão, se existe fidelidade, o que acontece se você se arrepender e quem faz o cadastro. Quase todas as plataformas dizem “sem comissão”; a diferença real está nas taxas de pagamento, no prazo de recebimento e na política de cancelamento.",
    publishedAt: "2026-11-05",
    updatedAt: "2026-11-05",
    reviewPending: true,
    tags: ["comparativo", "cardápio digital", "delivery próprio"],
    blocks: [
      {
        type: "p",
        text: "Se você já paga comissão no marketplace e procura um cardápio digital próprio, vai encontrar dezenas de opções prometendo “zero comissão”. Isso virou o mínimo do mercado. Este guia mostra o que de fato muda de uma plataforma para outra e como fazer a conta para a sua loja.",
      },
      { type: "h2", text: "1. Mensalidade: olhe a sua faixa, não o “a partir de”" },
      {
        type: "p",
        text: "A maioria cobra por faixa de pedidos no mês. O valor de entrada costuma ser parecido entre as plataformas; a diferença aparece quando a loja cresce. Pergunte: quanto custa com 200 pedidos? E com 300? Na Foode as faixas são públicas:",
      },
      { type: "table", head: ["Faixa de pedidos no mês", "Mensalidade"], rows: tierRows },
      { type: "h2", text: "2. Comissão por pedido" },
      {
        type: "p",
        text: "Comissão é o modelo do marketplace: uma porcentagem de cada venda. No cardápio próprio, o padrão é não ter comissão. Se a plataforma cobra “por pedido excedente” num plano gratuito, faça a conta: 100 pedidos extras a R$ 1,39 já passam de uma mensalidade de entrada.",
      },
      { type: "h2", text: "3. Taxa e prazo do PIX e do cartão" },
      {
        type: "p",
        text: "É aqui que mora a diferença escondida. Pergunte a taxa do PIX, a taxa do crédito e em quantos dias o dinheiro cai. Algumas plataformas publicam as taxas; outras só informam no contrato. Um crédito que só cai em 30 dias úteis custa capital de giro. Na Foode a taxa é combinada no cadastro da loja e o cartão tem dois modos: Normal (lote diário) e Rápido (D+1), com taxa diferente.",
      },
      { type: "h2", text: "4. Fidelidade e cancelamento" },
      {
        type: "p",
        text: "“Sem fidelidade” pode significar “cancela a qualquer momento” ou “cancela depois do fim da vigência do plano”. Leia a FAQ de planos da plataforma. Verifique também se a cobrança é pré-paga e como funciona a renovação.",
      },
      { type: "h2", text: "5. Teste grátis ou reembolso" },
      {
        type: "p",
        text: "Teste grátis de 7 dias é comum, mas um teste sem acompanhamento raramente mostra o produto funcionando com o seu cardápio e os seus clientes. A alternativa é o reembolso integral: você entra de verdade, com a equipe cadastrando a loja, e tem 7 dias para pedir o dinheiro de volta.",
      },
      { type: "h2", text: "6. Quem faz o cadastro" },
      {
        type: "p",
        text: "Cadastro self-service é rápido, mas deixa o cardápio pela metade. Plataformas com onboarding acompanhado cobram o mesmo e entregam a loja pronta. Pergunte quem monta o cardápio e em quanto tempo o link fica no ar.",
      },
      { type: "h2", text: "Como fazer a conta para a sua loja" },
      {
        type: "ul",
        items: [
          "Pedidos por mês que hoje vêm de clientes que já conhecem você (recorrentes).",
          "Ticket médio desses pedidos.",
          "Comissão que você paga hoje sobre eles.",
          `Compare o total da comissão com a mensalidade da sua faixa (a partir de ${tier1} na Foode).`,
        ],
      },
      {
        type: "p",
        text: "A calculadora na página inicial da Foode faz essa conta na hora. O marketplace continua útil para trazer cliente novo; o cardápio próprio é onde o cliente recorrente pede sem comissão.",
      },
    ],
    faq: [
      {
        question: "Cardápio digital sem comissão é realmente grátis?",
        answer:
          "Não. Sem comissão significa que a plataforma não fica com uma parte de cada venda; ela cobra uma mensalidade e, no pagamento online, uma taxa por transação.",
      },
      {
        question: "Qual é a diferença entre cardápio digital e marketplace?",
        answer:
          "O marketplace traz clientes novos e cobra comissão por pedido. O cardápio digital próprio é o seu link, sem comissão, onde o cliente que já conhece a loja pede de novo.",
      },
      {
        question: "Quanto custa o cardápio digital da Foode?",
        answer: `A mensalidade começa em ${tier1} para até ${FIRST_MONTHLY_TIER.maxOrders} pedidos no mês, sem comissão. O plano anual tem pedidos ilimitados e pode ser parcelado em até 6 vezes.`,
      },
    ],
  },
  {
    slug: "como-reduzir-comissao-do-delivery",
    title: "Como reduzir a comissão do delivery sem sair do iFood",
    description:
      "Passo a passo para levar o cliente recorrente para o seu próprio link e deixar de pagar comissão nesses pedidos, mantendo o marketplace para cliente novo.",
    answer:
      "Você não precisa sair do marketplace para pagar menos comissão. Mantenha o iFood para cliente novo e crie um canal próprio (link com cardápio, pagamento online e fila de pedidos) para o cliente que já conhece a loja. Coloque o link na bio, no WhatsApp, na embalagem e num QR Code; use um cupom de boas-vindas para o primeiro pedido pelo link. Cada pedido recorrente que migra deixa de pagar comissão.",
    publishedAt: "2026-11-05",
    updatedAt: "2026-11-05",
    reviewPending: true,
    tags: ["solução", "comissão", "canal próprio"],
    blocks: [
      {
        type: "p",
        text: "A comissão do marketplace faz sentido para um pedido de quem nunca comprou de você: a plataforma trouxe o cliente. O problema é pagar a mesma comissão no décimo pedido da mesma pessoa. É esse pedido que dá para tirar da comissão, sem brigar com o marketplace.",
      },
      { type: "h2", text: "Passo 1: tenha um link onde dá para pedir de verdade" },
      {
        type: "p",
        text: "WhatsApp funciona até certo volume, mas pedido por áudio erra, não cobra adicional e não recebe cartão. O canal próprio precisa de cardápio com complementos, checkout com endereço e pagamento (PIX e cartão online ou na entrega) e uma fila para a cozinha. É o que a Foode entrega em foodedelivery.com.br/loja/sua-loja.",
      },
      { type: "h2", text: "Passo 2: coloque o link onde o cliente recorrente está" },
      {
        type: "ul",
        items: [
          "Bio do Instagram e nome do perfil do WhatsApp Business.",
          "Mensagem automática de saudação do WhatsApp com o link.",
          "QR Code na embalagem, no cardápio físico e no balcão.",
          "Cartãozinho no pedido que sai pelo marketplace: “Da próxima vez, peça pelo nosso link e ganhe X”.",
        ],
      },
      { type: "h2", text: "Passo 3: dê um motivo para o primeiro pedido pelo link" },
      {
        type: "p",
        text: "Um cupom de boas-vindas (por exemplo, 10% no primeiro pedido) custa menos que a comissão daquele mesmo pedido no marketplace e cria o hábito. Na Foode o cupom tem código, valor em % ou R$, dias da semana e limite de usos.",
      },
      { type: "h2", text: "Passo 4: atenda igual ou melhor" },
      {
        type: "p",
        text: "O cliente só muda de canal se a experiência for boa: pedido confirmado com som na fila, impressão na cozinha, aviso no WhatsApp com link para acompanhar e estorno automático se precisar cancelar. Sem isso, ele volta para o app.",
      },
      { type: "h2", text: "Passo 5: meça" },
      {
        type: "p",
        text: "Acompanhe o funil visita → carrinho → pedido do seu link e os itens mais pedidos por dia da semana. Em poucos meses você sabe quantos pedidos migraram e quanto deixou de pagar de comissão.",
      },
      { type: "h2", text: "Quanto dá para economizar" },
      {
        type: "p",
        text: `Faça a conta com os seus números: pedidos recorrentes por mês × ticket médio × comissão atual. Compare com a mensalidade da sua faixa na Foode (a partir de ${tier1}). A calculadora na página inicial mostra o resultado na hora.`,
      },
    ],
    faq: [
      {
        question: "Preciso cancelar o iFood para ter cardápio próprio?",
        answer:
          "Não. O posicionamento recomendado é complementar: marketplace para cliente novo, link próprio para o recorrente.",
      },
      {
        question: "O cliente vai aceitar pedir fora do app?",
        answer:
          "Sim, se o link abrir no navegador sem instalar nada, aceitar PIX e cartão e confirmar o pedido com acompanhamento. Um cupom no primeiro pedido acelera a mudança.",
      },
      {
        question: "Em quanto tempo o link fica no ar?",
        answer:
          "Na Foode a equipe cria a loja e envia o convite; com o cardápio em mãos, o link e o QR Code saem no mesmo dia.",
      },
    ],
  },
];

export function findPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}
