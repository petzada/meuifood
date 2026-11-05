/**
 * Calendário de dias úteis para o Ledger de repasse (decisão 60: repasse previsto =
 * 1º dia útil após a liberação no provedor).
 *
 * Datas civis são strings `YYYY-MM-DD` (sem hora nem fuso). Instantes (`Date`) são
 * convertidos para a data civil em `America/Sao_Paulo` antes de qualquer conta, então
 * um pagamento às 23h30 de sexta em São Paulo é "sexta", mesmo já sendo sábado em UTC.
 *
 * Feriados: nacionais fixos (inclui Consciência Negra, Lei 14.759/2023, a partir de
 * 2024) e os móveis derivados da Páscoa que fecham o sistema bancário (calendário
 * FEBRABAN): Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi.
 * Feriados estaduais e municipais não entram: o repasse é um Pix feito pelo Ops e o
 * calendário bancário nacional é o que vale.
 *
 * TODO(26): confirmar com o Ops se Carnaval e Corpus Christi (pontos facultativos,
 * mas sem expediente bancário) devem mesmo empurrar o repasse; hoje empurram.
 */

export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

/** Data civil `YYYY-MM-DD`. */
export type CivilDate = string;

export type NationalHoliday = {
  date: CivilDate;
  name: string;
};

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseCivilDate(date: CivilDate): Date {
  const match = CIVIL_DATE.exec(date);
  if (!match) throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${date}`);
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    utc.getUTCFullYear() !== Number(y) ||
    utc.getUTCMonth() !== Number(m) - 1 ||
    utc.getUTCDate() !== Number(d)
  ) {
    throw new RangeError(`data inexistente: ${date}`);
  }
  return utc;
}

function formatCivilDate(utc: Date): CivilDate {
  return utc.toISOString().slice(0, 10);
}

function addDays(date: CivilDate, days: number): CivilDate {
  return formatCivilDate(new Date(parseCivilDate(date).getTime() + days * DAY_MS));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): CivilDate {
  if (!Number.isInteger(year) || year < 1583) throw new RangeError(`ano inválido: ${year}`);
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatCivilDate(new Date(Date.UTC(year, month - 1, day)));
}

const FIXED_HOLIDAYS: ReadonlyArray<{ monthDay: string; name: string; since?: number }> = [
  { monthDay: "01-01", name: "Confraternização Universal" },
  { monthDay: "04-21", name: "Tiradentes" },
  { monthDay: "05-01", name: "Dia do Trabalho" },
  { monthDay: "09-07", name: "Independência do Brasil" },
  { monthDay: "10-12", name: "Nossa Senhora Aparecida" },
  { monthDay: "11-02", name: "Finados" },
  { monthDay: "11-15", name: "Proclamação da República" },
  { monthDay: "11-20", name: "Dia Nacional de Zumbi e da Consciência Negra", since: 2024 },
  { monthDay: "12-25", name: "Natal" },
];

const holidayCache = new Map<number, ReadonlyMap<CivilDate, string>>();

function holidayMap(year: number): ReadonlyMap<CivilDate, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const map = new Map<CivilDate, string>();
  for (const holiday of FIXED_HOLIDAYS) {
    if (holiday.since !== undefined && year < holiday.since) continue;
    map.set(`${String(year).padStart(4, "0")}-${holiday.monthDay}`, holiday.name);
  }
  const easter = easterSunday(year);
  map.set(addDays(easter, -48), "Carnaval (segunda-feira)");
  map.set(addDays(easter, -47), "Carnaval (terça-feira)");
  map.set(addDays(easter, -2), "Sexta-feira Santa");
  map.set(addDays(easter, 60), "Corpus Christi");
  holidayCache.set(year, map);
  return map;
}

/** Feriados considerados no ano, em ordem cronológica. */
export function nationalHolidays(year: number): NationalHoliday[] {
  return [...holidayMap(year)]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isHoliday(date: CivilDate): boolean {
  const year = parseCivilDate(date).getUTCFullYear();
  return holidayMap(year).has(date);
}

export function isBusinessDay(date: CivilDate): boolean {
  const weekday = parseCivilDate(date).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !isHoliday(date);
}

/** Próximo dia útil estritamente depois de `date`. */
export function nextBusinessDay(date: CivilDate): CivilDate {
  let cursor = addDays(date, 1);
  while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** Soma `count` dias úteis (`count >= 0`); com 0 devolve a própria data. */
export function addBusinessDays(date: CivilDate, count: number): CivilDate {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`count inválido: ${count}`);
  let cursor = date;
  parseCivilDate(cursor);
  for (let i = 0; i < count; i += 1) cursor = nextBusinessDay(cursor);
  return cursor;
}

const saoPauloFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data civil de um instante em `America/Sao_Paulo`. */
export function saoPauloDate(instant: Date): CivilDate {
  if (Number.isNaN(instant.getTime())) throw new RangeError("instante inválido");
  const parts = saoPauloFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Repasse previsto (D+1 útil) para uma liberação no provedor: o 1º dia útil
 * estritamente depois da data civil da liberação em São Paulo.
 */
export function expectedPayoutDate(release: Date | CivilDate): CivilDate {
  const releaseDate = typeof release === "string" ? release : saoPauloDate(release);
  return nextBusinessDay(releaseDate);
}
