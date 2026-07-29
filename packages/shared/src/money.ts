/** Taxa comercial PIX: 1,19% (Decisão 32). Em basis points de 10_000. */
export const PIX_FEE_RATE_BPS = 119;

/**
 * Taxa PIX em centavos, half-up no resultado monetário único.
 * Inteiro puro: `(gross * 119 + 5000) / 10000` — sem float.
 */
export function pixFeeCents(grossCents: number): number {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new RangeError("gross_cents_invalid");
  }
  return Number((BigInt(grossCents) * BigInt(PIX_FEE_RATE_BPS) + 5000n) / 10000n);
}

export function pixNetCents(grossCents: number): number {
  return grossCents - pixFeeCents(grossCents);
}

/**
 * Soma um dia civil a uma data `YYYY-MM-DD` (calendário gregoriano).
 * D+1 comercial do PIX = dia civil seguinte em America/Sao_Paulo,
 * sem reinterpretar dias úteis (spec).
 */
export function addCalendarDaysIsoDate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (!match) throw new RangeError("iso_date_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new RangeError("iso_date_invalid");
  }
  utc.setUTCDate(utc.getUTCDate() + days);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Extrai o dia civil em `America/Sao_Paulo` de um Instant ISO-8601.
 * Usa `Intl` com timeZone IANA (Decisão 58) — não offset fixo.
 */
export function civilDateInSaoPaulo(isoInstant: string): string {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) throw new RangeError("instant_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) throw new RangeError("instant_invalid");
  return `${year}-${month}-${day}`;
}

/**
 * Previsão D+1: prefere data civil do provider; senão Instant de confirmação + 1 dia civil SP.
 */
export function pixExpectedPayoutDate(input: {
  confirmedAtIso: string;
  providerSettlementDate?: string | null;
}): string {
  const fromProvider = input.providerSettlementDate?.trim();
  if (fromProvider) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(fromProvider)) {
      throw new RangeError("provider_settlement_date_invalid");
    }
    return fromProvider;
  }
  return addCalendarDaysIsoDate(civilDateInSaoPaulo(input.confirmedAtIso), 1);
}
