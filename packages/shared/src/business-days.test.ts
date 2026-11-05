import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  easterSunday,
  expectedPayoutDate,
  isBusinessDay,
  isHoliday,
  nationalHolidays,
  nextBusinessDay,
  saoPauloDate,
} from "./business-days.js";

describe("easterSunday", () => {
  it.each([
    [2000, "2000-04-23"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("Páscoa de %i é %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe("nationalHolidays", () => {
  it("lista fixos e móveis de 2026 em ordem", () => {
    expect(nationalHolidays(2026).map((h) => h.date)).toEqual([
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("Consciência Negra só vale a partir de 2024", () => {
    expect(isHoliday("2023-11-20")).toBe(false);
    expect(isBusinessDay("2023-11-20")).toBe(true);
    expect(isHoliday("2024-11-20")).toBe(true);
  });
});

describe("isBusinessDay", () => {
  it("fim de semana não é dia útil", () => {
    expect(isBusinessDay("2026-11-14")).toBe(false);
    expect(isBusinessDay("2026-11-15")).toBe(false);
  });

  it("dia de semana comum é dia útil", () => {
    expect(isBusinessDay("2026-11-04")).toBe(true);
  });

  it("rejeita data malformada ou inexistente", () => {
    expect(() => isBusinessDay("2026-2-1")).toThrow(RangeError);
    expect(() => isBusinessDay("2026-02-30")).toThrow(RangeError);
  });
});

describe("nextBusinessDay", () => {
  it.each([
    ["2026-11-04", "2026-11-05", "quarta → quinta"],
    ["2026-11-19", "2026-11-23", "pula Consciência Negra (sexta) e fim de semana"],
    ["2026-11-13", "2026-11-16", "sexta → segunda (Proclamação cai no domingo)"],
    ["2026-04-02", "2026-04-06", "pula Sexta-feira Santa"],
    ["2026-02-13", "2026-02-18", "pula Carnaval"],
    ["2026-06-03", "2026-06-05", "pula Corpus Christi"],
    ["2026-12-24", "2026-12-28", "pula Natal"],
    ["2026-12-31", "2027-01-04", "vira o ano e pula Confraternização"],
    ["2026-11-14", "2026-11-16", "sábado → segunda"],
  ])("%s → %s (%s)", (from, expected) => {
    expect(nextBusinessDay(from)).toBe(expected);
  });
});

describe("addBusinessDays", () => {
  it("0 devolve a própria data", () => {
    expect(addBusinessDays("2026-11-14", 0)).toBe("2026-11-14");
  });

  it("soma vários dias úteis atravessando feriado", () => {
    expect(addBusinessDays("2026-11-18", 3)).toBe("2026-11-24");
  });

  it("rejeita contagem negativa ou fracionada", () => {
    expect(() => addBusinessDays("2026-11-18", -1)).toThrow(RangeError);
    expect(() => addBusinessDays("2026-11-18", 1.5)).toThrow(RangeError);
  });
});

describe("saoPauloDate", () => {
  it("usa o dia civil de São Paulo, não o de UTC", () => {
    // 02:30 UTC de 21/11 = 23:30 de 20/11 em São Paulo (UTC-3).
    expect(saoPauloDate(new Date("2026-11-21T02:30:00Z"))).toBe("2026-11-20");
    expect(saoPauloDate(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-21");
  });

  it("rejeita instante inválido", () => {
    expect(() => saoPauloDate(new Date("x"))).toThrow(RangeError);
  });
});

describe("expectedPayoutDate", () => {
  it("D+1 útil a partir do instante da liberação em São Paulo", () => {
    // Quinta 19/11 às 23:30 em SP → sexta 20/11 é feriado → segunda 23/11.
    expect(expectedPayoutDate(new Date("2026-11-20T02:30:00Z"))).toBe("2026-11-23");
  });

  it("liberação em fim de semana repassa no 1º dia útil seguinte", () => {
    expect(expectedPayoutDate("2026-11-14")).toBe("2026-11-16");
  });

  it("aceita data civil", () => {
    expect(expectedPayoutDate("2026-11-04")).toBe("2026-11-05");
  });
});
