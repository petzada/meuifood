// Horários de funcionamento e "Loja aberta agora" (decisões 41 e 58; Ticket 07 → 24a/24b).
// Fuso fixo `America/Sao_Paulo` pela TZDB do runtime (Intl), nunca offset fixo UTC−3: o cálculo
// segue regras históricas e futuras de horário de verão. Períodos `HH:MM` civis, cada um dentro
// de um único dia (`início < fim`, sem overnight). Função pura: a `api` usa na escrita do Pedido
// e no estado público da Loja; o Storefront e o Painel só exibem o resultado.
import { z } from "zod";

export const STORE_TIMEZONE = "America/Sao_Paulo";

/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const weekdaySchema = z.number().int().min(1).max(7);

export const WEEKDAY_LABELS_PT: Readonly<Record<Weekday, string>> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

/** Horário civil `HH:MM` (00:00–23:59). */
export const civilTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "use HH:MM");

/** Períodos por dia e no total (grade Seg–Dom com "+ período"). */
export const MAX_PERIODS_PER_DAY = 4;
export const MAX_OPENING_PERIODS = MAX_PERIODS_PER_DAY * 7;

export const openingPeriodSchema = z
  .object({
    weekday: weekdaySchema,
    opensAt: civilTimeSchema,
    closesAt: civilTimeSchema,
  })
  .refine((period) => period.opensAt < period.closesAt, {
    message: "o início precisa ser antes do fim",
    path: ["closesAt"],
  });
export type OpeningPeriod = { weekday: number; opensAt: string; closesAt: string };

export type OpeningHoursError =
  | { code: "invalid_period"; index: number }
  | { code: "overlap"; index: number }
  | { code: "too_many_periods"; index: number };

/**
 * Valida a grade inteira: cada período com `início < fim`, sem sobreposição no mesmo dia e até
 * MAX_PERIODS_PER_DAY por dia. Rejeição é atômica (decisão 58): a `api` não grava nada parcial.
 */
export function validateOpeningPeriods(
  periods: readonly OpeningPeriod[],
): { ok: true } | { ok: false; error: OpeningHoursError } {
  for (const [index, period] of periods.entries()) {
    if (!openingPeriodSchema.safeParse(period).success) {
      return { ok: false, error: { code: "invalid_period", index } };
    }
  }
  const perDay = new Map<number, number>();
  for (const [index, period] of periods.entries()) {
    const count = (perDay.get(period.weekday) ?? 0) + 1;
    perDay.set(period.weekday, count);
    if (count > MAX_PERIODS_PER_DAY)
      return { ok: false, error: { code: "too_many_periods", index } };
  }
  const ordered = periods
    .map((period, index) => ({ period, index }))
    .sort(
      (a, b) =>
        a.period.weekday - b.period.weekday || a.period.opensAt.localeCompare(b.period.opensAt),
    );
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    if (
      previous.period.weekday === current.period.weekday &&
      previous.period.closesAt > current.period.opensAt
    ) {
      return { ok: false, error: { code: "overlap", index: current.index } };
    }
  }
  return { ok: true };
}

export const openingHoursSchema = z
  .array(openingPeriodSchema)
  .max(MAX_OPENING_PERIODS)
  .superRefine((periods, ctx) => {
    const result = validateOpeningPeriods(periods);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: result.error.code,
        path: [result.error.index],
      });
    }
  });

/** Ordena a grade para exibição (Sobre a Loja, Painel). */
export function sortOpeningPeriods<T extends OpeningPeriod>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt));
}

// ---- Fuso: conversões instante ↔ horário civil de São Paulo pela TZDB (Intl). ----

type CivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
};

const WEEKDAY_BY_SHORT: Readonly<Record<string, Weekday>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

let formatter: Intl.DateTimeFormat | null = null;

function saoPauloFormatter(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIMEZONE,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return formatter;
}

/** Horário civil em São Paulo no instante `epochMs`. */
export function saoPauloCivil(epochMs: number): CivilDateTime & { second: number } {
  const parts: Record<string, string> = {};
  for (const part of saoPauloFormatter().formatToParts(new Date(epochMs))) {
    parts[part.type] = part.value;
  }
  const weekday = WEEKDAY_BY_SHORT[parts.weekday ?? ""];
  if (!weekday) throw new RangeError("hours: dia da semana não reconhecido");
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

/** Offset de São Paulo (minutos, ex.: −180) no instante `epochMs`. */
function offsetMinutesAt(epochMs: number): number {
  const civil = saoPauloCivil(epochMs);
  const asUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60_000);
}

/**
 * Instante (epoch ms) de um horário civil de São Paulo. Desambiguação `compatible` (como a do
 * Temporal usado no legado): horário repetido no fim do horário de verão → o primeiro; horário
 * inexistente no início → avança pelo tamanho do salto.
 */
export function saoPauloInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const DAY = 86_400_000;
  const before = wall - offsetMinutesAt(wall - DAY) * 60_000;
  const after = wall - offsetMinutesAt(wall + DAY) * 60_000;
  const matches = [before, after].filter((candidate) => {
    const civil = saoPauloCivil(candidate);
    return (
      civil.year === year &&
      civil.month === month &&
      civil.day === day &&
      civil.hour === hour &&
      civil.minute === minute
    );
  });
  return matches.length > 0 ? Math.min(...matches) : before;
}

function hhmm(civil: { hour: number; minute: number }): string {
  return `${String(civil.hour).padStart(2, "0")}:${String(civil.minute).padStart(2, "0")}`;
}

function parseHhmm(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

/** Próxima abertura: instante ISO e o horário civil (para "Abre amanhã às 18:00"). */
export type NextOpening = { at: string; weekday: Weekday; opensAt: string };

export const nextOpeningSchema = z.object({
  at: z.iso.datetime(),
  weekday: weekdaySchema,
  opensAt: civilTimeSchema,
});

/**
 * Estado de funcionamento (decisão 41): Pausa vence o horário; fora de todos os períodos = fechada
 * com a próxima abertura (null se a grade está vazia); dentro de um período = aberta até `closesAt`.
 */
export type StoreOpenState =
  | { state: "open"; closesAt: string }
  | { state: "closed"; nextOpening: NextOpening | null }
  | { state: "paused" };

export const storeOpenStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("open"), closesAt: z.iso.datetime() }),
  z.object({ state: z.literal("closed"), nextOpening: nextOpeningSchema.nullable() }),
  z.object({ state: z.literal("paused") }),
]);

export function storeOpenState(input: {
  now: Date;
  paused: boolean;
  periods: readonly OpeningPeriod[];
}): StoreOpenState {
  if (input.paused) return { state: "paused" };
  const nowMs = input.now.getTime();
  const civil = saoPauloCivil(nowMs);
  const current = hhmm(civil);
  const openPeriod = input.periods.find(
    (period) =>
      period.weekday === civil.weekday && period.opensAt <= current && current < period.closesAt,
  );
  if (openPeriod) {
    const close = parseHhmm(openPeriod.closesAt);
    const closesAt = saoPauloInstant(civil.year, civil.month, civil.day, close.hour, close.minute);
    return { state: "open", closesAt: new Date(closesAt).toISOString() };
  }
  return { state: "closed", nextOpening: nextOpeningAfter(nowMs, input.periods) };
}

/** Checkout liberado só com a Loja aberta e sem Pausa. */
export function isStoreOpenNow(input: {
  now: Date;
  paused: boolean;
  periods: readonly OpeningPeriod[];
}): boolean {
  return storeOpenState(input).state === "open";
}

function nextOpeningAfter(nowMs: number, periods: readonly OpeningPeriod[]): NextOpening | null {
  if (periods.length === 0) return null;
  const today = saoPauloCivil(nowMs);
  let best: { epoch: number; weekday: Weekday; opensAt: string } | null = null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = (((today.weekday - 1 + offset) % 7) + 1) as Weekday;
    for (const period of periods) {
      if (period.weekday !== weekday) continue;
      const open = parseHhmm(period.opensAt);
      const epoch = saoPauloInstant(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        open.hour,
        open.minute,
      );
      if (epoch > nowMs && (!best || epoch < best.epoch)) {
        best = { epoch, weekday, opensAt: period.opensAt };
      }
    }
    if (best) break;
  }
  return best
    ? { at: new Date(best.epoch).toISOString(), weekday: best.weekday, opensAt: best.opensAt }
    : null;
}
