// Períodos dos relatórios do Dono (Ticket 14; REL-01, P-REL-5): atalhos Hoje · 7 dias · 30 dias ·
// Mês atual · Personalizado, sempre em dias civis de America/Sao_Paulo, e o período anterior de
// MESMA duração (base do comparativo). Datas civis `YYYY-MM-DD`; instantes em ISO UTC com
// milissegundos (o formato gravado no D1). "Hoje" vem SEMPRE do relógio do servidor.
import { z } from "zod";

import type { CivilDate } from "../business-days.js";

export const REPORT_PRESETS = ["today", "7d", "30d", "month", "custom"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** Período máximo (dias, inclusivo) de um relatório ou de uma consulta de Repasses/margem. */
export const REPORT_MAX_DAYS = 92;

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 86_400_000;

export function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function civilEpoch(date: CivilDate): number {
  if (!isCivilDate(date)) throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${date}`);
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** `date` + `days` dias civis (negativo volta). */
export function addCivilDays(date: CivilDate, days: number): CivilDate {
  if (!Number.isInteger(days)) throw new RangeError(`dias inválidos: ${days}`);
  return new Date(civilEpoch(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Dias do período [from, to], inclusivo (from = to → 1). */
export function civilDaysInclusive(from: CivilDate, to: CivilDate): number {
  return Math.round((civilEpoch(to) - civilEpoch(from)) / DAY_MS) + 1;
}

/** Dia da semana da data civil: 0 = domingo … 6 = sábado. */
export function civilWeekday(date: CivilDate): number {
  return new Date(civilEpoch(date)).getUTCDay();
}

const SAO_PAULO_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Instante UTC (ISO) da meia-noite de São Paulo no início de `date`. */
export function saoPauloDayStartUtc(date: CivilDate): string {
  // UTC−3 desde 2019 (sem horário de verão); o Intl confere e corrige se a regra mudar.
  let guess = civilEpoch(date) + 3 * 3_600_000;
  const hour = Number(SAO_PAULO_HOUR.format(new Date(guess)));
  if (hour !== 0) guess -= (hour > 12 ? hour - 24 : hour) * 3_600_000;
  return new Date(guess).toISOString();
}

/** Intervalo UTC meio-aberto `[fromUtc, toUtc)` dos dias civis [from, to] de São Paulo. */
export function civilRangeUtc(from: CivilDate, to: CivilDate): { fromUtc: string; toUtc: string } {
  if (from > to) throw new RangeError(`período invertido: ${from} > ${to}`);
  return { fromUtc: saoPauloDayStartUtc(from), toUtc: saoPauloDayStartUtc(addCivilDays(to, 1)) };
}

export const civilDateSchema = z.string().refine(isCivilDate, "Data inválida.");

/** Período civil [from, to] com até REPORT_MAX_DAYS dias. */
export const civilPeriodSchema = z
  .object({ from: civilDateSchema, to: civilDateSchema })
  .strict()
  .refine((value) => value.from <= value.to, { message: "Início depois do fim.", path: ["to"] })
  .refine((value) => civilDaysInclusive(value.from, value.to) <= REPORT_MAX_DAYS, {
    message: `Período de até ${REPORT_MAX_DAYS} dias.`,
    path: ["to"],
  });
export type CivilPeriod = { from: CivilDate; to: CivilDate };

/**
 * Entrada do período do relatório: um atalho ou `custom` com datas. O fim do Personalizado não
 * pode passar de hoje (conferido em `resolveReportPeriod`, que conhece o relógio do servidor).
 */
export const reportPeriodInputSchema = z.discriminatedUnion("preset", [
  z.object({ preset: z.literal("today") }).strict(),
  z.object({ preset: z.literal("7d") }).strict(),
  z.object({ preset: z.literal("30d") }).strict(),
  z.object({ preset: z.literal("month") }).strict(),
  z
    .object({ preset: z.literal("custom"), from: civilDateSchema, to: civilDateSchema })
    .strict()
    .refine((value) => value.from <= value.to, { message: "Início depois do fim.", path: ["to"] })
    .refine((value) => civilDaysInclusive(value.from, value.to) <= REPORT_MAX_DAYS, {
      message: `Período de até ${REPORT_MAX_DAYS} dias.`,
      path: ["to"],
    }),
]);
export type ReportPeriodInput = z.input<typeof reportPeriodInputSchema>;

export type ResolvedReportPeriod = {
  preset: ReportPreset;
  from: CivilDate;
  to: CivilDate;
  /** Dias do período (inclusivo). */
  days: number;
  /** Período imediatamente anterior, de mesma duração. */
  previous: CivilPeriod;
  /** Complemento do comparativo: "ontem", "7 dias anteriores", "período anterior"… */
  comparisonLabel: string;
};

const PRESET_LABEL: Record<Exclude<ReportPreset, "custom" | "month">, string> = {
  today: "ontem",
  "7d": "7 dias anteriores",
  "30d": "30 dias anteriores",
};

/** Período anterior de mesma duração, colado no início de [from, to]. */
export function previousPeriod(from: CivilDate, to: CivilDate): CivilPeriod {
  const days = civilDaysInclusive(from, to);
  return { from: addCivilDays(from, -days), to: addCivilDays(from, -1) };
}

/**
 * Resolve o atalho para datas civis a partir de `today` (São Paulo, do servidor). Personalizado
 * com fim no futuro = null (a api responde `invalid_input`).
 */
export function resolveReportPeriod(
  input: z.output<typeof reportPeriodInputSchema>,
  today: CivilDate,
): ResolvedReportPeriod | null {
  let from: CivilDate;
  let to: CivilDate = today;
  switch (input.preset) {
    case "today":
      from = today;
      break;
    case "7d":
      from = addCivilDays(today, -6);
      break;
    case "30d":
      from = addCivilDays(today, -29);
      break;
    case "month":
      from = `${today.slice(0, 7)}-01`;
      break;
    case "custom":
      if (input.to > today) return null;
      from = input.from;
      to = input.to;
      break;
  }
  const days = civilDaysInclusive(from, to);
  const comparisonLabel =
    input.preset === "custom" || input.preset === "month"
      ? days === 1
        ? "dia anterior"
        : `${days} dias anteriores`
      : PRESET_LABEL[input.preset];
  return {
    preset: input.preset,
    from,
    to,
    days,
    previous: previousPeriod(from, to),
    comparisonLabel,
  };
}
