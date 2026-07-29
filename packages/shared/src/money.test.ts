import { describe, expect, it } from "vitest";

import {
  addCalendarDaysIsoDate,
  civilDateInSaoPaulo,
  pixExpectedPayoutDate,
  pixFeeCents,
  pixNetCents,
} from "./money.js";

describe("taxa PIX 1,19% (centavos, half-up)", () => {
  it("R$ 100,00 → taxa R$ 1,19 e líquido R$ 98,81", () => {
    expect(pixFeeCents(10_000)).toBe(119);
    expect(pixNetCents(10_000)).toBe(9_881);
  });

  it("arredonda half-up em bordas de meio centavo de taxa", () => {
    // 42 * 1,19% = 0,4998 → 0
    expect(pixFeeCents(42)).toBe(0);
    // 43 * 1,19% = 0,5117 → 1
    expect(pixFeeCents(43)).toBe(1);
    // 8361 * 1,19% = 99,4959 → 99
    expect(pixFeeCents(8_361)).toBe(99);
    // 8362 * 1,19% = 99,5078 → 100
    expect(pixFeeCents(8_362)).toBe(100);
  });

  it("zero e centavos pequenos não inventam taxa negativa", () => {
    expect(pixFeeCents(0)).toBe(0);
    expect(pixFeeCents(1)).toBe(0);
    expect(pixNetCents(1)).toBe(1);
  });

  it("rejeita gross inválido", () => {
    expect(() => pixFeeCents(-1)).toThrow(/gross_cents_invalid/);
    expect(() => pixFeeCents(1.5)).toThrow(/gross_cents_invalid/);
  });
});

describe("D+1 civil America/Sao_Paulo", () => {
  it("soma dia civil sem reinterpretar dias úteis", () => {
    expect(addCalendarDaysIsoDate("2026-07-31", 1)).toBe("2026-08-01");
    expect(addCalendarDaysIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    // sexta → sábado (não pula para segunda)
    expect(addCalendarDaysIsoDate("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("extrai dia civil em Sao Paulo atravessando meia-noite UTC", () => {
    // 2026-07-30 03:30 UTC = 2026-07-30 00:30 em SP (UTC−3)
    expect(civilDateInSaoPaulo("2026-07-30T03:30:00.000Z")).toBe("2026-07-30");
    // 2026-07-30 02:30 UTC = 2026-07-29 23:30 em SP
    expect(civilDateInSaoPaulo("2026-07-30T02:30:00.000Z")).toBe("2026-07-29");
  });

  it("prefere settlement do provider; senão Instant+1 dia civil", () => {
    expect(
      pixExpectedPayoutDate({
        confirmedAtIso: "2026-07-29T15:00:00.000Z",
        providerSettlementDate: "2026-08-05",
      }),
    ).toBe("2026-08-05");
    expect(
      pixExpectedPayoutDate({
        confirmedAtIso: "2026-07-29T15:00:00.000Z",
        providerSettlementDate: null,
      }),
    ).toBe("2026-07-30");
  });
});
