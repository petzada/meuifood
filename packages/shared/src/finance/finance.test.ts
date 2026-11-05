import { describe, expect, it } from "vitest";

import { can } from "../auth/policy.js";
import { buildFunnelReport } from "../onboarding/funnel.js";
import { compareMetric, comparisonText, formatChangePercent } from "./comparison.js";
import {
  buildCsv,
  CSV_BOM,
  CSV_FORBIDDEN_HEADERS,
  csvCents,
  csvField,
  reportCsv,
  reportCsvFilename,
} from "./csv.js";
import {
  buildMarginView,
  isPayableBatch,
  marginRow,
  opsPayoutAdjustmentInputSchema,
  opsPayoutMarkPaidInputSchema,
  ownerPayoutsInputSchema,
  payoutBatchTotals,
  payoutLineStatus,
  payoutStatusTotals,
  type PayoutLineView,
} from "./payout.js";
import {
  addCivilDays,
  civilDaysInclusive,
  civilRangeUtc,
  civilWeekday,
  previousPeriod,
  reportPeriodInputSchema,
  resolveReportPeriod,
  saoPauloDayStartUtc,
} from "./period.js";
import {
  buildFinanceReport,
  reportBreakdowns,
  reportInputSchema,
  reportSummary,
  reportTopCustomers,
  reportTopItems,
  type ReportOrderAggregateRow,
} from "./report.js";

const UUID = "0b5c3f4e-2a8d-4c1e-9f7a-1d2e3f4a5b6c";

describe("períodos (America/Sao_Paulo)", () => {
  it("meia-noite de São Paulo é 03:00 UTC", () => {
    expect(saoPauloDayStartUtc("2026-11-05")).toBe("2026-11-05T03:00:00.000Z");
    expect(civilRangeUtc("2026-11-01", "2026-11-30")).toEqual({
      fromUtc: "2026-11-01T03:00:00.000Z",
      toUtc: "2026-12-01T03:00:00.000Z",
    });
    expect(() => civilRangeUtc("2026-11-02", "2026-11-01")).toThrow(RangeError);
  });

  it("aritmética de datas civis, viradas de mês/ano e dia da semana", () => {
    expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCivilDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(civilDaysInclusive("2026-11-01", "2026-11-01")).toBe(1);
    expect(civilDaysInclusive("2026-11-01", "2026-11-30")).toBe(30);
    expect(civilWeekday("2026-11-01")).toBe(0);
    expect(civilWeekday("2026-11-07")).toBe(6);
    expect(() => addCivilDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addCivilDays("2026-11-01", 0.5)).toThrow(RangeError);
  });

  it("atalhos resolvem a partir de hoje, com anterior de mesma duração", () => {
    const today = "2026-11-05";
    expect(resolveReportPeriod({ preset: "today" }, today)).toMatchObject({
      from: today,
      to: today,
      days: 1,
      previous: { from: "2026-11-04", to: "2026-11-04" },
      comparisonLabel: "ontem",
    });
    expect(resolveReportPeriod({ preset: "7d" }, today)).toMatchObject({
      from: "2026-10-30",
      days: 7,
      previous: { from: "2026-10-23", to: "2026-10-29" },
      comparisonLabel: "7 dias anteriores",
    });
    expect(resolveReportPeriod({ preset: "30d" }, today)).toMatchObject({
      from: "2026-10-07",
      days: 30,
      comparisonLabel: "30 dias anteriores",
    });
    expect(resolveReportPeriod({ preset: "month" }, today)).toMatchObject({
      from: "2026-11-01",
      to: today,
      days: 5,
      previous: { from: "2026-10-27", to: "2026-10-31" },
      comparisonLabel: "5 dias anteriores",
    });
    expect(resolveReportPeriod({ preset: "month" }, "2026-11-01")?.comparisonLabel).toBe(
      "dia anterior",
    );
    expect(
      resolveReportPeriod({ preset: "custom", from: "2026-10-01", to: "2026-10-10" }, today),
    ).toMatchObject({ days: 10, previous: { from: "2026-09-21", to: "2026-09-30" } });
    expect(
      resolveReportPeriod({ preset: "custom", from: "2026-11-01", to: "2026-11-06" }, today),
    ).toBeNull();
  });

  it("schema recusa período invertido, longo demais ou campo extra", () => {
    expect(reportPeriodInputSchema.safeParse({ preset: "7d" }).success).toBe(true);
    expect(
      reportPeriodInputSchema.safeParse({ preset: "custom", from: "2026-11-05", to: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(
      reportPeriodInputSchema.safeParse({ preset: "custom", from: "2026-01-01", to: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(reportPeriodInputSchema.safeParse({ preset: "7d", storeId: UUID }).success).toBe(false);
    expect(reportInputSchema.safeParse({ period: { preset: "today" } }).success).toBe(true);
    expect(previousPeriod("2026-11-01", "2026-11-01")).toEqual({
      from: "2026-10-31",
      to: "2026-10-31",
    });
  });
});

describe("comparativo com o período anterior", () => {
  it("percentual em basis points, seta e texto (nunca só cor)", () => {
    const up = compareMetric(112, 100);
    expect(up).toEqual({ current: 112, previous: 100, changeBps: 1200, direction: "up" });
    expect(comparisonText(up, "7 dias anteriores")).toEqual({
      arrow: "↑",
      text: "+12% vs. 7 dias anteriores",
    });
    const down = compareMetric(2, 3);
    expect(down.changeBps).toBe(-3333);
    expect(comparisonText(down, "ontem")).toEqual({ arrow: "↓", text: "−33,3% vs. ontem" });
    expect(comparisonText(compareMetric(5, 5), "ontem")).toEqual({
      arrow: "→",
      text: "Igual vs. ontem",
    });
    expect(comparisonText(compareMetric(5, 0), "ontem").text).toBe("Sem base vs. ontem");
    expect(comparisonText(compareMetric(0, 0), "ontem").text).toBe("Sem movimento vs. ontem");
    expect(formatChangePercent(15)).toBe("+0,2%");
    expect(formatChangePercent(0)).toBe("0%");
    expect(() => compareMetric(-1, 0)).toThrow(RangeError);
  });
});

const ROWS: ReportOrderAggregateRow[] = [
  {
    status: "completed",
    fulfillment: "delivery",
    paymentMethod: "pix",
    orders: 2,
    totalCents: 6000,
  },
  {
    status: "completed",
    fulfillment: "pickup",
    paymentMethod: "on_delivery",
    orders: 1,
    totalCents: 1500,
  },
  {
    status: "preparing",
    fulfillment: "pickup",
    paymentMethod: "credit",
    orders: 1,
    totalCents: 2500,
  },
  {
    status: "cancelled",
    fulfillment: "delivery",
    paymentMethod: "pix",
    orders: 3,
    totalCents: 9000,
  },
];

function funnel() {
  return buildFunnelReport("2026-11-01", "2026-11-05", [
    { day: "2026-11-02", event: "visit", count: 10 },
    { day: "2026-11-02", event: "item_view", count: 5 },
    { day: "2026-11-02", event: "order", count: 1 },
  ]);
}

describe("relatório", () => {
  it("resumo: cancelados à parte, ticket médio arredondado e GMV só Concluído online", () => {
    expect(reportSummary(ROWS)).toEqual({
      orders: 4,
      cancelled: 3,
      totalSoldCents: 10000,
      averageTicketCents: 2500,
      gmvCents: 6000,
    });
    expect(reportSummary([])).toEqual({
      orders: 0,
      cancelled: 0,
      totalSoldCents: 0,
      averageTicketCents: 0,
      gmvCents: 0,
    });
    expect(
      reportSummary([
        {
          status: "completed",
          fulfillment: "pickup",
          paymentMethod: "pix",
          orders: 3,
          totalCents: 1000,
        },
      ]).averageTicketCents,
    ).toBe(333);
    expect(() => reportSummary([{ ...ROWS[0]!, orders: -1 }])).toThrow(RangeError);
  });

  it("quebras por status (todos), Fulfillment e meio (sem cancelados)", () => {
    const { byStatus, byFulfillment, byPaymentMethod } = reportBreakdowns(ROWS);
    expect(byStatus.map((row) => row.key)).toEqual([
      "received",
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "completed",
      "cancelled",
    ]);
    expect(byStatus.find((row) => row.key === "cancelled")).toEqual({
      key: "cancelled",
      orders: 3,
      totalCents: 9000,
    });
    expect(byFulfillment).toEqual([
      { key: "delivery", orders: 2, totalCents: 6000 },
      { key: "pickup", orders: 2, totalCents: 4000 },
    ]);
    expect(byPaymentMethod).toEqual([
      { key: "pix", orders: 2, totalCents: 6000 },
      { key: "credit", orders: 1, totalCents: 2500 },
      { key: "on_delivery", orders: 1, totalCents: 1500 },
    ]);
  });

  it("top itens por quantidade com quebra Dom–Sáb e limite de 10", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      itemKey: `item-${index}`,
      itemName: `Item ${String(index).padStart(2, "0")}`,
      weekday: index % 7,
      quantity: index + 1,
      totalCents: (index + 1) * 100,
    }));
    rows.push({
      itemKey: "item-11",
      itemName: "Item 11",
      weekday: 0,
      quantity: 3,
      totalCents: 300,
    });
    const top = reportTopItems(rows);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({
      rank: 1,
      name: "Item 11",
      quantity: 15,
      totalCents: 1500,
      byWeekday: [3, 0, 0, 0, 12, 0, 0],
    });
    expect(top.at(-1)?.name).toBe("Item 02");
    expect(() => reportTopItems([{ ...rows[0]!, weekday: 7 }])).toThrow(RangeError);
  });

  it("TOP 10 clientes: só nome, quantidade e total, ordenado por valor", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      name: `Cliente ${index}`,
      orders: 1,
      totalCents: 1000 + index,
      phone: "5511999999999",
    }));
    const top = reportTopCustomers(rows);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ rank: 1, name: "Cliente 10", orders: 1, totalCents: 1010 });
    for (const customer of top) {
      expect(Object.keys(customer).sort()).toEqual(["name", "orders", "rank", "totalCents"]);
    }
  });

  it("monta o relatório com comparativo e marca vazio", () => {
    const period = resolveReportPeriod({ preset: "7d" }, "2026-11-05")!;
    const report = buildFinanceReport({
      period,
      current: ROWS,
      previous: [ROWS[0]!],
      items: [],
      customers: [],
      funnel: funnel(),
    });
    expect(report.empty).toBe(false);
    expect(report.comparison.orders).toMatchObject({ current: 4, previous: 2, changeBps: 10000 });
    const empty = buildFinanceReport({
      period,
      current: [],
      previous: [],
      items: [],
      customers: [],
      funnel: funnel(),
    });
    expect(empty.empty).toBe(true);
  });
});

describe("CSV (Excel pt-BR)", () => {
  it("BOM, `;`, CRLF, vírgula decimal e escape", () => {
    expect(csvCents(123456)).toBe("1234,56");
    expect(csvCents(-5)).toBe("-0,05");
    expect(csvCents(0)).toBe("0,00");
    expect(() => csvCents(1.5)).toThrow(RangeError);
    expect(csvField('X-Burger "duplo"; grande')).toBe('"X-Burger ""duplo""; grande"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-12,50")).toBe("-12,50");
    expect(csvField(" pad")).toBe('" pad"');
    expect(
      buildCsv([
        ["a", 1],
        ["b", "c"],
      ]),
    ).toBe(`${CSV_BOM}a;1\r\nb;c\r\n`);
  });

  it("relatório exportado não tem coluna de dado pessoal nem o TOP 10 clientes", () => {
    const report = buildFinanceReport({
      period: resolveReportPeriod({ preset: "7d" }, "2026-11-05")!,
      current: ROWS,
      previous: [],
      items: [
        { itemKey: "x", itemName: "Pastel; queijo", weekday: 2, quantity: 4, totalCents: 4000 },
      ],
      customers: [{ name: "Maria Secreta", orders: 9, totalCents: 99_999 }],
      funnel: funnel(),
    });
    const csv = reportCsv(report);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).not.toContain("Maria Secreta");
    expect(csv).toContain('"Pastel; queijo";4;40,00;0;0;4;0;0;0;0');
    expect(csv).toContain("Total vendido (R$);100,00;0,00;");
    const lower = csv.toLowerCase();
    for (const header of CSV_FORBIDDEN_HEADERS) expect(lower).not.toContain(header);
    expect(reportCsvFilename("Loja-X!", report)).toBe(
      "relatorio-loja-x-2026-10-30-a-2026-11-05.csv",
    );
    expect(reportCsvFilename("", report)).toBe("relatorio-loja-2026-10-30-a-2026-11-05.csv");
  });
});

describe("repasses e lotes", () => {
  it("status da linha", () => {
    const base = { kind: "payment" as const, paid: false, annulled: false, today: "2026-11-05" };
    expect(payoutLineStatus({ ...base, dueDate: "2026-11-06" })).toBe("scheduled");
    expect(payoutLineStatus({ ...base, dueDate: "2026-11-05" })).toBe("in_batch");
    expect(payoutLineStatus({ ...base, dueDate: null })).toBe("in_batch");
    expect(payoutLineStatus({ ...base, dueDate: "2026-11-01", paid: true })).toBe("paid");
    expect(payoutLineStatus({ ...base, dueDate: "2026-11-01", annulled: true })).toBe("annulled");
    expect(payoutLineStatus({ ...base, kind: "refund_debit", dueDate: "2026-11-01" })).toBe(
      "refund_debit",
    );
  });

  it("totais por status", () => {
    const line = (status: PayoutLineView["status"], netCents: number) =>
      ({ status, netCents }) as PayoutLineView;
    const totals = payoutStatusTotals([
      line("paid", 100),
      line("paid", 50),
      line("refund_debit", -30),
    ]);
    expect(totals.paid).toEqual({ count: 2, netCents: 150 });
    expect(totals.refund_debit).toEqual({ count: 1, netCents: -30 });
    expect(totals.scheduled).toEqual({ count: 0, netCents: 0 });
  });

  it("totais do lote: lançamentos − débitos + ajustes; sinais conferidos", () => {
    const totals = payoutBatchTotals([
      { kind: "entry", id: "e1", amountCents: 5000 },
      { kind: "retention", id: "r1", amountCents: 700 },
      { kind: "debit", id: "d1", amountCents: -1200 },
      { kind: "adjustment", id: "a1", amountCents: -300 },
      { kind: "adjustment", id: "a2", amountCents: 100 },
    ]);
    expect(totals).toEqual({
      entriesCents: 5700,
      debitsCents: 1200,
      adjustmentsCents: -200,
      amountCents: 4300,
      itemCount: 5,
    });
    expect(isPayableBatch(totals)).toBe(true);
    expect(isPayableBatch({ amountCents: 0 })).toBe(false);
    expect(() => payoutBatchTotals([{ kind: "debit", id: "d", amountCents: 1 }])).toThrow();
    expect(() => payoutBatchTotals([{ kind: "entry", id: "e", amountCents: -1 }])).toThrow();
    expect(() => payoutBatchTotals([{ kind: "adjustment", id: "a", amountCents: 0 }])).toThrow();
    expect(() => payoutBatchTotals([{ kind: "entry", id: "e", amountCents: 0.5 }])).toThrow();
  });

  it("schemas: marcar pago e ajuste", () => {
    const valid = {
      storeId: UUID,
      asOf: "2026-11-05",
      paidOn: "2026-11-05",
      sourceAccount: "abacatepay",
      reference: " E2E123 ",
      transferCostCents: 80,
      expectedAmountCents: 4300,
      idempotencyKey: UUID,
    };
    const parsed = opsPayoutMarkPaidInputSchema.parse(valid);
    expect(parsed.reference).toBe("E2E123");
    expect(opsPayoutMarkPaidInputSchema.safeParse({ ...valid, paidOn: "2026-11-04" }).success).toBe(
      false,
    );
    expect(
      opsPayoutMarkPaidInputSchema.safeParse({ ...valid, expectedAmountCents: 0 }).success,
    ).toBe(false);
    expect(
      opsPayoutMarkPaidInputSchema.safeParse({ ...valid, sourceAccount: "itau" }).success,
    ).toBe(false);
    expect(
      opsPayoutAdjustmentInputSchema.parse({
        storeId: UUID,
        amountCents: -150,
        reason: "Correção",
      }),
    ).toEqual({ storeId: UUID, amountCents: -150, reason: "Correção", batchId: null });
    expect(
      opsPayoutAdjustmentInputSchema.safeParse({ storeId: UUID, amountCents: 0, reason: "abc" })
        .success,
    ).toBe(false);
    expect(
      ownerPayoutsInputSchema.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success,
    ).toBe(true);
  });

  it("margem = taxa Foode líquida − custo do provedor − envio; tarifa de serviço à parte", () => {
    const row = {
      storeId: "s1",
      storeName: "Loja A",
      payments: 3,
      foodeFeeCents: 600,
      refundedFoodeFeeCents: 100,
      serviceFeeCents: 450,
      refundedServiceFeeCents: 150,
      providerCostCents: 162,
      providerCostUnknown: 1,
      transferCostCents: 80,
      batches: 1,
    };
    expect(marginRow(row)).toMatchObject({
      foodeFeeCents: 500,
      marginCents: 258,
      serviceFeeCents: 300,
    });
    const view = buildMarginView("2026-11-01", "2026-11-05", [
      row,
      { ...row, storeId: "s2", storeName: "Loja B", foodeFeeCents: 100, refundedFoodeFeeCents: 0 },
    ]);
    expect(view.stores.map((store) => store.storeId)).toEqual(["s1", "s2"]);
    expect(view.totals).toMatchObject({ payments: 6, marginCents: 258 + (100 - 162 - 80) });
    expect(() => marginRow({ ...row, providerCostCents: -1 })).toThrow(RangeError);
  });
});

describe("matriz de papéis (store.finance)", () => {
  it("só o Dono acessa o financeiro da Loja", () => {
    expect(can("owner", "store.finance")).toBe(true);
    expect(can("operator", "store.finance")).toBe(false);
    expect(can("foode_ops", "store.finance")).toBe(false);
  });
});
