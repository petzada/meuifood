import { Temporal } from "@js-temporal/polyfill";

export const STORE_TIMEZONE = "America/Sao_Paulo";

export type OperatingPeriod = {
  closesAt: string;
  opensAt: string;
  weekday: number;
};

export type StoreOperation = {
  checkout: {
    allowed: boolean;
    blockReason: "outside_hours" | "paused" | null;
  };
  nextOpeningAt: string | null;
  state: "open" | "outside_hours" | "paused";
  timezone: typeof STORE_TIMEZONE;
};

const civilTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export function validateOperatingPeriods(
  periods: readonly OperatingPeriod[],
): { ok: true } | { error: "invalid_operating_periods"; ok: false } {
  if (
    periods.some(
      ({ closesAt, opensAt, weekday }) =>
        !Number.isInteger(weekday) ||
        weekday < 1 ||
        weekday > 7 ||
        !civilTimePattern.test(opensAt) ||
        !civilTimePattern.test(closesAt) ||
        opensAt >= closesAt,
    )
  ) {
    return { error: "invalid_operating_periods", ok: false };
  }

  const ordered = [...periods].sort(
    (left, right) =>
      left.weekday - right.weekday ||
      left.opensAt.localeCompare(right.opensAt) ||
      left.closesAt.localeCompare(right.closesAt),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous &&
      current &&
      previous.weekday === current.weekday &&
      previous.closesAt > current.opensAt
    ) {
      return { error: "invalid_operating_periods", ok: false };
    }
  }

  return { ok: true };
}

function localCivilTime(now: Temporal.ZonedDateTime) {
  return `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
}

function nextOpening(
  now: Temporal.Instant,
  periods: readonly OperatingPeriod[],
): string | null {
  const localNow = now.toZonedDateTimeISO(STORE_TIMEZONE);
  let next: Temporal.Instant | null = null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const date = localNow.toPlainDate().add({ days: dayOffset });
    for (const period of periods) {
      if (period.weekday !== date.dayOfWeek) continue;
      const candidate = date
        .toPlainDateTime(Temporal.PlainTime.from(period.opensAt))
        .toZonedDateTime(STORE_TIMEZONE, { disambiguation: "compatible" })
        .toInstant();
      if (
        Temporal.Instant.compare(candidate, now) > 0 &&
        (!next || Temporal.Instant.compare(candidate, next) < 0)
      ) {
        next = candidate;
      }
    }
  }

  return next?.toString() ?? null;
}

export function calculateStoreOperation({
  now,
  paused,
  periods,
}: {
  now: Temporal.Instant;
  paused: boolean;
  periods: readonly OperatingPeriod[];
}): StoreOperation {
  if (paused) {
    return {
      checkout: { allowed: false, blockReason: "paused" },
      nextOpeningAt: null,
      state: "paused",
      timezone: STORE_TIMEZONE,
    };
  }

  const localNow = now.toZonedDateTimeISO(STORE_TIMEZONE);
  const currentTime = localCivilTime(localNow);
  const open = periods.some(
    (period) =>
      period.weekday === localNow.dayOfWeek &&
      period.opensAt <= currentTime &&
      currentTime < period.closesAt,
  );

  if (open) {
    return {
      checkout: { allowed: true, blockReason: null },
      nextOpeningAt: null,
      state: "open",
      timezone: STORE_TIMEZONE,
    };
  }

  return {
    checkout: { allowed: false, blockReason: "outside_hours" },
    nextOpeningAt: nextOpening(now, periods),
    state: "outside_hours",
    timezone: STORE_TIMEZONE,
  };
}
