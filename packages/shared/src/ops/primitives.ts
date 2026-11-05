// Primitivas do contrato Ops (Ticket 29): dinheiro em centavos, percentuais em basis points,
// instantes UTC no formato do D1 e vigência [início, fim). Sem dependência do banco.
import { z } from "zod";

/** Centavos inteiros não negativos (nunca float). */
export const centsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Percentual em basis points: 1 bp = 0,01%; 349 = 3,49%; 10000 = 100%. */
export const basisPointsSchema = z.number().int().min(0).max(10_000);

/**
 * Instante em ISO-8601. Aceita offset e normaliza para UTC com milissegundos
 * (`2026-11-04T12:00:00.000Z`), o mesmo formato que o `utcCheck` do D1 exige.
 */
export const utcInstantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

/**
 * Vigência meio-aberta [validFrom, validTo): vale a partir de `validFrom` e deixa de valer em
 * `validTo`. `validTo` null = sem fim. Encerrar uma vigência é gravar `validTo`; o valor
 * nunca é reescrito (histórico preservado).
 */
export type Period = { validFrom: string; validTo: string | null };

/** Duas vigências se sobrepõem se cada uma começa antes de a outra terminar. */
export function periodsOverlap(a: Period, b: Period): boolean {
  const aStartsBeforeBEnds = b.validTo === null || a.validFrom < b.validTo;
  const bStartsBeforeAEnds = a.validTo === null || b.validFrom < a.validTo;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/** A vigência vale no instante `at` (ISO UTC). Taxa futura não vale hoje. */
export function isEffectiveAt(period: Period, at: string): boolean {
  return period.validFrom <= at && (period.validTo === null || at < period.validTo);
}

/** Índices [i, j] do primeiro par sobreposto na lista; null se nenhum. */
export function findOverlap(periods: readonly Period[]): [number, number] | null {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) return [i, j];
    }
  }
  return null;
}

/** Vigência de entrada: `validTo` opcional e, se vier, depois de `validFrom`. */
export const periodInputShape = {
  validFrom: utcInstantSchema,
  validTo: utcInstantSchema.nullable().default(null),
};

export function validToAfterValidFrom(value: { validFrom: string; validTo: string | null }) {
  return value.validTo === null || value.validTo > value.validFrom;
}

export const VALID_TO_MESSAGE = "O fim da vigência deve ser depois do início.";
