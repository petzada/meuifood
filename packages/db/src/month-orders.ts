// Mês civil de America/Sao_Paulo e contagem de Pedidos do mês por Loja (decisão 61: base da faixa
// do Plano). Usado pelo Ops (lista/detalhe de Lojas) e pelo Dono (banner e `/plano`).

const SAO_PAULO_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
});

/** Mês civil `YYYY-MM` em America/Sao_Paulo do instante ISO `at`. */
export function saoPauloMonth(at: string): string {
  const parts = SAO_PAULO_MONTH.formatToParts(new Date(at));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

const SAO_PAULO_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Instante UTC da meia-noite de São Paulo no dia 1 de `year`/`month` (1–12). */
function saoPauloMonthStartUtc(year: number, month: number): string {
  // UTC−3 desde 2019 (sem horário de verão); o Intl confere e corrige se a regra mudar.
  let guess = Date.UTC(year, month - 1, 1, 3);
  const hour = Number(SAO_PAULO_HOUR.format(new Date(guess)));
  if (hour !== 0) guess -= (hour > 12 ? hour - 24 : hour) * 3_600_000;
  return new Date(guess).toISOString();
}

/** Intervalo UTC `[from, to)` do mês civil `YYYY-MM` em America/Sao_Paulo. */
export function saoPauloMonthRange(month: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError(`mês inválido: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new RangeError(`mês inválido: ${month}`);
  const next = monthNumber === 12 ? [year + 1, 1] : [year, monthNumber + 1];
  return {
    from: saoPauloMonthStartUtc(year, monthNumber),
    to: saoPauloMonthStartUtc(next[0]!, next[1]!),
  };
}

/** Parâmetros por consulta (o D1 aceita até 100 por statement). */
const COUNT_CHUNK = 90;

/**
 * Contagem de Pedidos do mês (decisão 61): Pedidos NÃO cancelados do Canal próprio no mês civil
 * de America/Sao_Paulo (`created_at` em UTC dentro do intervalo do mês).
 * TODO(26): sem `payment_status` em `orders` ainda (migration 0007 no PR do Ticket 26); quando
 * existir, Pedido PIX não pago fica fora da contagem.
 */
export async function monthOrderCounts(
  d1: D1Database,
  storeIds: readonly string[],
  month: string,
): Promise<Map<string, number>> {
  const counts = new Map(storeIds.map((id) => [id, 0]));
  if (storeIds.length === 0) return counts;
  const { from, to } = saoPauloMonthRange(month);
  for (let index = 0; index < storeIds.length; index += COUNT_CHUNK) {
    const chunk = storeIds.slice(index, index + COUNT_CHUNK);
    const { results } = await d1
      .prepare(
        `SELECT store_id AS storeId, count(*) AS total FROM orders
         WHERE store_id IN (${chunk.map(() => "?").join(", ")})
           AND status <> 'cancelled' AND created_at >= ? AND created_at < ?
         GROUP BY store_id`,
      )
      .bind(...chunk, from, to)
      .all<{ storeId: string; total: number }>();
    for (const row of results) counts.set(row.storeId, row.total);
  }
  return counts;
}
