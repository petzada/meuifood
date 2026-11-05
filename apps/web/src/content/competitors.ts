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
import { FIRST_MONTHLY_TIER, formatBRL } from "./pricing";

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

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    label: "Mensalidade inicial",
    foode: `${formatBRL(FIRST_MONTHLY_TIER.priceCents)}/mês`,
    others: ["R$ 99,99/mês", "R$ 99,90/mês"],
    foodeWins: true,
  },
  {
    label: "Pedidos na faixa inicial",
    foode: `Até ${FIRST_MONTHLY_TIER.maxOrders} pedidos/mês`,
    others: ["Até 150 pedidos/mês", "Ilimitados (R$ 99,90) · grátis até 30 + R$ 1,39/pedido"],
    foodeWins: false,
  },
  {
    label: "Comissão por pedido",
    foode: "Nenhuma",
    others: ["Nenhuma", "Nenhuma"],
    foodeWins: false,
  },
  {
    label: "Taxa do PIX online",
    foode: "Combinada no cadastro, sem custo escondido",
    others: ["0,99%", null],
    foodeWins: false,
  },
  {
    label: "Cartão de crédito: recebimento",
    foode: "Normal (lote diário) ou Rápido (D+1)",
    others: ["30 dias úteis a 3,49% ou D+1 a 4,69%", null],
    foodeWins: true,
  },
  {
    label: "Plano anual",
    foode: "6× no cartão, pedidos ilimitados",
    others: ["12× R$ 99,99", "12× R$ 59,94 (Básico)"],
    foodeWins: false,
  },
  {
    label: "Fidelidade",
    foode: "Sem fidelidade",
    others: ["Cancela após o fim da vigência do plano", null],
    foodeWins: true,
  },
  {
    label: "Arrependimento",
    foode: `Reembolso integral em até ${REFUND_DAYS} dias`,
    others: ["Teste grátis de 7 dias", "Plano grátis limitado"],
    foodeWins: true,
  },
  {
    label: "Cadastro da loja",
    foode: "Feito pela equipe Foode, com acompanhamento",
    others: ["Onboarding acompanhado", null],
    foodeWins: false,
  },
];
