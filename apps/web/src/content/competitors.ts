// Comparativo da landing (decisão 70): dois concorrentes reais, apresentados como "Outra
// plataforma" (sem citar nome na página), títulos nas cores de cada marca. SÓ dados públicos
// verificáveis, com fonte e data. Dado não verificado = `null` (a célula mostra "—"), nunca
// um chute. Atualize `readAt` ao reconferir.
//
// Fontes:
//  - A (Anota AI): print `docs/referencias/anota-ai/LOJISTA/02-planos.png` (anota.ai, 2026-11-04)
//    e `72-planos.png` (FAQ de planos, 2026-11-04); taxas de pagamento: decisão 61 (anota.ai,
//    lido em 2026-11-04).
//  - B (Goomer): https://goomer.com.br/planos lido em 2026-11-05 ("Cardápio Digital para
//    Delivery": Grátis até 30 pedidos/mês + R$ 1,39 por pedido excedido; Básico R$ 99,90/mês,
//    pedidos ilimitados; "Sem taxas ou comissões"; taxas e prazo de repasse não publicados).
//
// TODO(31-dono): confirmar a cor da marca B (provisória) e reconferir as taxas de A antes de
// publicar.
import {
  ANNUAL_INSTALLMENTS,
  DEFAULT_FEES,
  FIRST_MONTHLY_TIER,
  formatBRL,
  formatFee,
  RELEASE_TERMS,
} from "./pricing";

export const REFUND_DAYS = 7;

export type CompetitorColumn = {
  /** Identificação interna (não aparece na página). */
  key: "anota" | "goomer";
  /** Cor da marca usada no título da coluna. */
  brandColor: string;
  source: string;
  readAt: string;
};

export const COMPETITORS: readonly CompetitorColumn[] = [
  {
    key: "anota",
    brandColor: "#1e96fc",
    source: "anota.ai (prints 02-planos.png e 72-planos.png em docs/referencias) e decisão 61",
    readAt: "2026-11-04",
  },
  {
    key: "goomer",
    brandColor: "#ff6a3d",
    source: "goomer.com.br/planos",
    readAt: "2026-11-05",
  },
];

export type ComparisonRow = {
  label: string;
  foode: string;
  /** Mesma ordem de `COMPETITORS`; `null` = dado não verificado. */
  others: readonly [string | null, string | null];
  /** Linha em que a Foode ganha de forma comparável (destaque na coluna). */
  foodeWins: boolean;
};

// Regra de layout (Dono, 2026-11-05): cada linha compara UMA coisa só (prazo OU tarifa OU
// benefício), com respostas no mesmo formato em todas as colunas, curtas e diretas.
export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    label: "Mensalidade inicial",
    foode: `${formatBRL(FIRST_MONTHLY_TIER.priceCents)}/mês`,
    others: ["R$ 99,99/mês", "R$ 99,90/mês"],
    foodeWins: true,
  },
  {
    label: "Pedidos na faixa inicial",
    foode: `Até ${FIRST_MONTHLY_TIER.maxOrders}/mês`,
    others: ["Até 150/mês", "Ilimitados"],
    foodeWins: false,
  },
  {
    label: "Comissão por pedido",
    foode: "Nenhuma",
    others: ["Nenhuma", "Nenhuma"],
    foodeWins: false,
  },
  {
    label: "Taxa do PIX",
    foode: formatFee(DEFAULT_FEES.pix),
    others: ["0,99%", null],
    foodeWins: false,
  },
  {
    label: "Liberação do PIX",
    foode: RELEASE_TERMS.pix,
    others: [null, null],
    foodeWins: false,
  },
  {
    label: "Taxa do cartão (Normal)",
    foode: formatFee(DEFAULT_FEES.cardNormal),
    others: ["3,49%", null],
    foodeWins: false,
  },
  {
    label: "Liberação do cartão (Normal)",
    foode: RELEASE_TERMS.cardNormal,
    others: ["30 dias úteis", null],
    foodeWins: true,
  },
  {
    label: "Taxa do cartão (Rápido)",
    foode: formatFee(DEFAULT_FEES.cardRapido),
    others: ["4,69%", null],
    foodeWins: false,
  },
  {
    label: "Liberação do cartão (Rápido)",
    foode: RELEASE_TERMS.cardRapido,
    others: ["1 dia útil (D+1)", null],
    foodeWins: false,
  },
  {
    label: "Repasse ao lojista",
    foode: "Lote diário",
    others: [null, null],
    foodeWins: false,
  },
  {
    label: "Plano anual",
    foode: `${ANNUAL_INSTALLMENTS}× no cartão`,
    others: ["12× no cartão", "12× no cartão"],
    foodeWins: false,
  },
  {
    label: "Fidelidade",
    foode: "Não",
    others: ["Sim, até o fim da vigência", null],
    foodeWins: true,
  },
  {
    label: "Arrependimento",
    foode: `Reembolso em até ${REFUND_DAYS} dias`,
    others: ["Teste grátis de 7 dias", "Plano grátis limitado"],
    foodeWins: true,
  },
  {
    label: "Cadastro da loja",
    foode: "Feito pela Foode",
    others: ["Acompanhado", null],
    foodeWins: false,
  },
];
