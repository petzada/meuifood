// Comparativo do topo dos relatórios com o período anterior de mesma duração (P-REL-5, decisão 63):
// seta + texto ("↑ +12% vs. 7 dias anteriores"), nunca só cor. Variação em basis points inteiros
// (1200 = +12%), arredondada meio-para-longe-do-zero; sem base (anterior = 0) não há percentual.

export type ComparisonDirection = "up" | "down" | "flat";

export type MetricComparison = {
  current: number;
  previous: number;
  /** (atual − anterior) / anterior em basis points; null quando o anterior é 0. */
  changeBps: number | null;
  direction: ComparisonDirection;
};

/** Divisão inteira arredondada meio-para-longe-do-zero (sem float acumulado). */
function roundedRatioBps(delta: number, base: number): number {
  const scaled = Math.abs(delta) * 10_000;
  const rounded = Math.floor((scaled + Math.floor(base / 2)) / base);
  return delta < 0 ? -rounded : rounded;
}

export function compareMetric(current: number, previous: number): MetricComparison {
  for (const [label, value] of [
    ["current", current],
    ["previous", previous],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`comparativo: ${label} inválido (${value})`);
    }
  }
  const delta = current - previous;
  return {
    current,
    previous,
    changeBps: previous === 0 ? null : roundedRatioBps(delta, previous),
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

const ARROW: Record<ComparisonDirection, string> = { up: "↑", down: "↓", flat: "→" };

/** "+12%", "−3,5%", "0%" a partir de basis points (uma casa decimal só quando há fração). */
export function formatChangePercent(changeBps: number): string {
  const sign = changeBps > 0 ? "+" : changeBps < 0 ? "−" : "";
  const abs = Math.abs(changeBps);
  const tenths = Math.round(abs / 10);
  const integer = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  return `${sign}${integer}${fraction === 0 ? "" : `,${fraction}`}%`;
}

export type ComparisonText = {
  /** Seta textual (acessível junto do texto): ↑, ↓ ou →. */
  arrow: string;
  /** "+12% vs. 7 dias anteriores", "Sem Pedidos nos 7 dias anteriores", "Igual a ontem". */
  text: string;
};

/** Texto do comparativo para o topo do relatório (a seta nunca é a única pista). */
export function comparisonText(comparison: MetricComparison, label: string): ComparisonText {
  const arrow = ARROW[comparison.direction];
  if (comparison.changeBps === null) {
    return {
      arrow,
      text: comparison.current === 0 ? `Sem movimento vs. ${label}` : `Sem base vs. ${label}`,
    };
  }
  if (comparison.direction === "flat") return { arrow, text: `Igual vs. ${label}` };
  return { arrow, text: `${formatChangePercent(comparison.changeBps)} vs. ${label}` };
}
