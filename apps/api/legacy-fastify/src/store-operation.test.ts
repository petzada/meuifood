import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  calculateStoreOperation,
  validateOperatingPeriods,
} from "./store-operation.js";

const mondayLunch = [
  { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
];

function instant(value: string) {
  return Temporal.Instant.from(value);
}

describe("estado temporal da Loja", () => {
  it("considera o início inclusivo e o fim exclusivo", () => {
    expect(
      calculateStoreOperation({
        now: instant("2026-07-27T14:00:00Z"),
        paused: false,
        periods: mondayLunch,
      }).state,
    ).toBe("open");

    expect(
      calculateStoreOperation({
        now: instant("2026-07-27T17:00:00Z"),
        paused: false,
        periods: mondayLunch,
      }),
    ).toMatchObject({
      checkout: { allowed: false, blockReason: "outside_hours" },
      nextOpeningAt: "2026-08-03T14:00:00Z",
      state: "outside_hours",
      timezone: "America/Sao_Paulo",
    });
  });

  it("calcula a próxima abertura no próximo dia configurado", () => {
    expect(
      calculateStoreOperation({
        now: instant("2026-07-27T18:00:00Z"),
        paused: false,
        periods: [
          ...mondayLunch,
          { weekday: 3, opensAt: "18:30", closesAt: "22:00" },
        ],
      }).nextOpeningAt,
    ).toBe("2026-07-29T21:30:00Z");
  });

  it("dá precedência imediata à Pausa sem perder os horários", () => {
    expect(
      calculateStoreOperation({
        now: instant("2026-07-27T15:00:00Z"),
        paused: true,
        periods: mondayLunch,
      }),
    ).toEqual({
      checkout: { allowed: false, blockReason: "paused" },
      nextOpeningAt: null,
      state: "paused",
      timezone: "America/Sao_Paulo",
    });
  });

  it("usa a TZDB IANA em uma data histórica com DST", () => {
    expect(
      calculateStoreOperation({
        now: instant("2018-11-04T03:30:00Z"),
        paused: false,
        periods: [
          { weekday: 7, opensAt: "01:00", closesAt: "02:00" },
        ],
      }).state,
    ).toBe("open");
  });
});

describe("validação dos períodos", () => {
  it("aceita dias fechados e períodos ordenados sem sobreposição", () => {
    expect(
      validateOperatingPeriods([
        { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
        { weekday: 1, opensAt: "18:00", closesAt: "22:30" },
      ]),
    ).toEqual({ ok: true });
    expect(validateOperatingPeriods([])).toEqual({ ok: true });
  });

  it.each([
    {
      name: "dia fora do limite",
      periods: [{ weekday: 0, opensAt: "11:00", closesAt: "14:00" }],
    },
    {
      name: "horário fora de HH:MM",
      periods: [{ weekday: 1, opensAt: "8:00", closesAt: "14:00" }],
    },
    {
      name: "início igual ao fim",
      periods: [{ weekday: 1, opensAt: "11:00", closesAt: "11:00" }],
    },
    {
      name: "período overnight",
      periods: [{ weekday: 1, opensAt: "18:00", closesAt: "02:00" }],
    },
    {
      name: "sobreposição",
      periods: [
        { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
        { weekday: 1, opensAt: "13:59", closesAt: "18:00" },
      ],
    },
  ])("rejeita $name", ({ periods }) => {
    expect(validateOperatingPeriods(periods)).toEqual({
      error: "invalid_operating_periods",
      ok: false,
    });
  });
});
