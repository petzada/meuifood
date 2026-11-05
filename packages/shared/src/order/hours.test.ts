import { describe, expect, it } from "vitest";

import {
  isStoreOpenNow,
  openingHoursSchema,
  saoPauloInstant,
  storeOpenState,
  validateOpeningPeriods,
} from "./hours.js";

// 2026-11-05 é quinta-feira (weekday 4). São Paulo sem horário de verão: UTC−3.
const at = (iso: string) => new Date(iso);
const weekdays = [
  { weekday: 4, opensAt: "11:00", closesAt: "14:00" },
  { weekday: 4, opensAt: "18:00", closesAt: "23:00" },
  { weekday: 5, opensAt: "18:00", closesAt: "23:00" },
];

describe("storeOpenState (America/Sao_Paulo)", () => {
  it("aberta dentro do período, até o fim dele", () => {
    // 12:00 local = 15:00Z
    expect(
      storeOpenState({ now: at("2026-11-05T15:00:00Z"), paused: false, periods: weekdays }),
    ).toEqual({ state: "open", closesAt: "2026-11-05T17:00:00.000Z" });
  });

  it("início inclusivo e fim exclusivo", () => {
    const periods = weekdays;
    expect(isStoreOpenNow({ now: at("2026-11-05T14:00:00Z"), paused: false, periods })).toBe(true);
    expect(isStoreOpenNow({ now: at("2026-11-05T17:00:00Z"), paused: false, periods })).toBe(false);
  });

  it("fechada entre períodos: próxima abertura no mesmo dia", () => {
    expect(
      storeOpenState({ now: at("2026-11-05T18:00:00Z"), paused: false, periods: weekdays }),
    ).toEqual({
      state: "closed",
      nextOpening: { at: "2026-11-05T21:00:00.000Z", weekday: 4, opensAt: "18:00" },
    });
  });

  it("fechada depois do último período: próxima abertura no dia seguinte", () => {
    // 23:30 local de quinta = 02:30Z de sexta
    const state = storeOpenState({
      now: at("2026-11-06T02:30:00Z"),
      paused: false,
      periods: weekdays,
    });
    expect(state).toEqual({
      state: "closed",
      nextOpening: { at: "2026-11-06T21:00:00.000Z", weekday: 5, opensAt: "18:00" },
    });
  });

  it("usa o dia civil de São Paulo, não o de UTC", () => {
    // 01:00Z de sexta = 22:00 de quinta em São Paulo: aberta pelo período de quinta.
    expect(
      isStoreOpenNow({ now: at("2026-11-06T01:00:00Z"), paused: false, periods: weekdays }),
    ).toBe(true);
  });

  it("volta uma semana quando só há um dia na grade", () => {
    const periods = [{ weekday: 4, opensAt: "11:00", closesAt: "14:00" }];
    const state = storeOpenState({ now: at("2026-11-05T18:00:00Z"), paused: false, periods });
    expect(state).toEqual({
      state: "closed",
      nextOpening: { at: "2026-11-12T14:00:00.000Z", weekday: 4, opensAt: "11:00" },
    });
  });

  it("Pausa vence o horário; grade vazia = fechada sem próxima abertura", () => {
    expect(
      storeOpenState({ now: at("2026-11-05T15:00:00Z"), paused: true, periods: weekdays }),
    ).toEqual({
      state: "paused",
    });
    expect(storeOpenState({ now: at("2026-11-05T15:00:00Z"), paused: false, periods: [] })).toEqual(
      {
        state: "closed",
        nextOpening: null,
      },
    );
  });

  it("segue a TZDB (horário de verão histórico de 2018), não um offset fixo", () => {
    // 2018-12-01 (sábado) em horário de verão: UTC−2. 12:00 local = 14:00Z.
    expect(saoPauloInstant(2018, 12, 1, 12, 0)).toBe(Date.parse("2018-12-01T14:00:00Z"));
    const periods = [{ weekday: 6, opensAt: "11:00", closesAt: "13:00" }];
    expect(isStoreOpenNow({ now: at("2018-12-01T14:30:00Z"), paused: false, periods })).toBe(true);
    // Às 15:30Z seriam 12:30 em UTC−3, mas já são 13:30 em UTC−2: fechada.
    expect(isStoreOpenNow({ now: at("2018-12-01T15:30:00Z"), paused: false, periods })).toBe(false);
  });

  it("horário inexistente no início do horário de verão avança (compatible)", () => {
    // 2018-11-04 00:00 não existiu em São Paulo (saltou para 01:00, UTC−2 = 03:00Z).
    expect(saoPauloInstant(2018, 11, 4, 0, 0)).toBe(Date.parse("2018-11-04T03:00:00Z"));
  });
});

describe("validação da grade (decisão 58)", () => {
  it("rejeita início ≥ fim, horário fora de HH:MM e sobreposição", () => {
    expect(validateOpeningPeriods([{ weekday: 1, opensAt: "18:00", closesAt: "18:00" }])).toEqual({
      ok: false,
      error: { code: "invalid_period", index: 0 },
    });
    expect(validateOpeningPeriods([{ weekday: 1, opensAt: "22:00", closesAt: "02:00" }]).ok).toBe(
      false,
    );
    expect(validateOpeningPeriods([{ weekday: 1, opensAt: "9:00", closesAt: "12:00" }]).ok).toBe(
      false,
    );
    expect(validateOpeningPeriods([{ weekday: 8, opensAt: "09:00", closesAt: "12:00" }]).ok).toBe(
      false,
    );
    expect(
      validateOpeningPeriods([
        { weekday: 1, opensAt: "18:00", closesAt: "23:00" },
        { weekday: 1, opensAt: "11:00", closesAt: "18:30" },
      ]),
    ).toEqual({ ok: false, error: { code: "overlap", index: 0 } });
  });

  it("aceita períodos encostados e até 4 por dia", () => {
    const periods = [
      { weekday: 2, opensAt: "08:00", closesAt: "10:00" },
      { weekday: 2, opensAt: "10:00", closesAt: "12:00" },
      { weekday: 2, opensAt: "12:00", closesAt: "14:00" },
      { weekday: 2, opensAt: "14:00", closesAt: "16:00" },
    ];
    expect(openingHoursSchema.safeParse(periods).success).toBe(true);
    expect(
      openingHoursSchema.safeParse([
        ...periods,
        { weekday: 2, opensAt: "16:00", closesAt: "18:00" },
      ]).success,
    ).toBe(false);
  });
});
