import { Temporal } from "@js-temporal/polyfill";

const STORE_TIMEZONE = "America/Sao_Paulo";

export type CheckoutPeriod = {
  closesAt: string;
  opensAt: string;
  weekday: number;
};

/** Revalida Pausa e horário no `now` da requisição (mesmo critério do Canal). */
export function checkoutBlockReason(args: {
  nowIso: string;
  paused: boolean;
  periods: readonly CheckoutPeriod[];
}): "paused" | "outside_hours" | null {
  if (args.paused) return "paused";

  const localNow = Temporal.Instant.from(args.nowIso).toZonedDateTimeISO(
    STORE_TIMEZONE,
  );
  const currentTime = `${String(localNow.hour).padStart(2, "0")}:${String(localNow.minute).padStart(2, "0")}`;
  const open = args.periods.some(
    (period) =>
      period.weekday === localNow.dayOfWeek &&
      period.opensAt <= currentTime &&
      currentTime < period.closesAt,
  );
  return open ? null : "outside_hours";
}
