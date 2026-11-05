// Propriedades (fast-check) do dinheiro e das datas do financeiro (Ticket 14, decisão 67).
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { compareMetric } from "./comparison.js";
import { csvCents } from "./csv.js";
import { payoutBatchTotals, type PayoutItem } from "./payout.js";
import {
  addCivilDays,
  civilDaysInclusive,
  civilRangeUtc,
  resolveReportPeriod,
  saoPauloDayStartUtc,
} from "./period.js";
import { reportSummary } from "./report.js";

const civilDate = fc
  .date({
    min: new Date("2020-01-01T00:00:00Z"),
    max: new Date("2035-12-31T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString().slice(0, 10));

const cents = fc.integer({ min: 0, max: 100_000_000 });

describe("propriedades das datas", () => {
  it("o anterior tem a mesma duração e termina na véspera do início", () => {
    fc.assert(
      fc.property(civilDate, fc.integer({ min: 0, max: 91 }), (today, back) => {
        const from = addCivilDays(today, -back);
        const period = resolveReportPeriod({ preset: "custom", from, to: today }, today)!;
        expect(civilDaysInclusive(period.previous.from, period.previous.to)).toBe(period.days);
        expect(addCivilDays(period.previous.to, 1)).toBe(period.from);
      }),
    );
  });

  it("intervalos UTC de dias consecutivos se encostam (sem buraco nem sobreposição)", () => {
    fc.assert(
      fc.property(civilDate, fc.integer({ min: 0, max: 60 }), (from, extra) => {
        const to = addCivilDays(from, extra);
        const range = civilRangeUtc(from, to);
        expect(range.toUtc).toBe(saoPauloDayStartUtc(addCivilDays(to, 1)));
        expect(range.fromUtc < range.toUtc).toBe(true);
        expect(Date.parse(range.toUtc) - Date.parse(range.fromUtc)).toBe((extra + 1) * 86_400_000);
      }),
    );
  });

  it("somar e subtrair dias é inverso", () => {
    fc.assert(
      fc.property(civilDate, fc.integer({ min: -400, max: 400 }), (date, days) => {
        expect(addCivilDays(addCivilDays(date, days), -days)).toBe(date);
      }),
    );
  });
});

describe("propriedades do dinheiro", () => {
  it("lote: valor = lançamentos − débitos + ajustes, independente da ordem", () => {
    const item = fc.oneof(
      fc.record({ kind: fc.constant("entry" as const), id: fc.uuid(), amountCents: cents }),
      fc.record({ kind: fc.constant("retention" as const), id: fc.uuid(), amountCents: cents }),
      fc.record({
        kind: fc.constant("debit" as const),
        id: fc.uuid(),
        amountCents: cents.map((value) => -value),
      }),
      fc.record({
        kind: fc.constant("adjustment" as const),
        id: fc.uuid(),
        amountCents: fc.integer({ min: -100_000_000, max: 100_000_000 }).filter((v) => v !== 0),
      }),
    );
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), (items: PayoutItem[]) => {
        const totals = payoutBatchTotals(items);
        const sum = items.reduce((acc, current) => acc + current.amountCents, 0);
        expect(totals.amountCents).toBe(sum);
        expect(totals.entriesCents).toBeGreaterThanOrEqual(0);
        expect(totals.debitsCents).toBeGreaterThanOrEqual(0);
        expect(payoutBatchTotals([...items].reverse())).toEqual(totals);
      }),
    );
  });

  it("CSV: centavos voltam exatos da representação com vírgula", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000_000, max: 100_000_000 }), (value) => {
        const text = csvCents(value);
        expect(text).toMatch(/^-?\d+,\d{2}$/u);
        const [reais, fraction] = text.replace("-", "").split(",");
        const back = Number(reais) * 100 + Number(fraction);
        expect(text.startsWith("-") ? -back : back).toBe(value);
      }),
    );
  });

  it("resumo: total vendido = soma dos não cancelados; ticket médio entre min e max", () => {
    const row = fc.record({
      status: fc.constantFrom("received", "preparing", "completed", "cancelled") as fc.Arbitrary<
        "received" | "preparing" | "completed" | "cancelled"
      >,
      fulfillment: fc.constantFrom("delivery", "pickup") as fc.Arbitrary<"delivery" | "pickup">,
      paymentMethod: fc.constantFrom("pix", "credit", "on_delivery") as fc.Arbitrary<
        "pix" | "credit" | "on_delivery"
      >,
      orders: fc.integer({ min: 1, max: 50 }),
      totalCents: cents,
    });
    fc.assert(
      fc.property(fc.array(row, { maxLength: 20 }), (rows) => {
        const summary = reportSummary(rows);
        const live = rows.filter((r) => r.status !== "cancelled");
        expect(summary.totalSoldCents).toBe(live.reduce((acc, r) => acc + r.totalCents, 0));
        expect(summary.gmvCents).toBeLessThanOrEqual(summary.totalSoldCents);
        if (summary.orders > 0) {
          expect(
            Math.abs(summary.averageTicketCents * summary.orders - summary.totalSoldCents),
          ).toBeLessThanOrEqual(summary.orders);
        }
      }),
    );
  });

  it("comparativo: sinal da variação acompanha a direção", () => {
    fc.assert(
      fc.property(cents, cents, (current, previous) => {
        const result = compareMetric(current, previous);
        if (previous === 0) expect(result.changeBps).toBeNull();
        else if (result.direction === "up") expect(result.changeBps!).toBeGreaterThanOrEqual(0);
        else if (result.direction === "down") expect(result.changeBps!).toBeLessThanOrEqual(0);
        else expect(result.changeBps).toBe(0);
      }),
    );
  });
});
