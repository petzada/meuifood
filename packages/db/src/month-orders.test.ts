// Mês civil de São Paulo e contagem de Pedidos do mês (decisão 61), sem banco: o D1 é um dublê
// que guarda o SQL e os parâmetros. A contagem real contra o schema roda nos `*.d1.test.ts`.
import { describe, expect, it } from "vitest";

import { monthOrderCounts, saoPauloMonth, saoPauloMonthRange } from "./month-orders";

function fakeD1(rows: { storeId: string; total: number }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const d1 = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params });
          return {
            all: async () => ({
              results: rows.filter((row) => params.includes(row.storeId)),
            }),
          };
        },
      };
    },
  } as unknown as D1Database;
  return { calls, d1 };
}

describe("mês civil de São Paulo", () => {
  it("vira o mês à meia-noite de Brasília, não à de UTC", () => {
    expect(saoPauloMonth("2026-12-01T02:59:59.999Z")).toBe("2026-11");
    expect(saoPauloMonth("2026-12-01T03:00:00.000Z")).toBe("2026-12");
  });

  it("intervalo UTC [início, fim) do mês, inclusive a virada do ano", () => {
    expect(saoPauloMonthRange("2026-11")).toEqual({
      from: "2026-11-01T03:00:00.000Z",
      to: "2026-12-01T03:00:00.000Z",
    });
    expect(saoPauloMonthRange("2026-12")).toEqual({
      from: "2026-12-01T03:00:00.000Z",
      to: "2027-01-01T03:00:00.000Z",
    });
    expect(() => saoPauloMonthRange("2026-13")).toThrow(RangeError);
    expect(() => saoPauloMonthRange("nov")).toThrow(RangeError);
  });
});

describe("Pedidos do mês por Loja", () => {
  it("conta só não cancelados dentro do mês e devolve 0 para Loja sem Pedido", async () => {
    const { calls, d1 } = fakeD1([{ storeId: "a", total: 128 }]);
    const counts = await monthOrderCounts(d1, ["a", "b"], "2026-11");
    expect(counts).toEqual(
      new Map([
        ["a", 128],
        ["b", 0],
      ]),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("status <> 'cancelled'");
    expect(calls[0]?.params).toEqual([
      "a",
      "b",
      "2026-11-01T03:00:00.000Z",
      "2026-12-01T03:00:00.000Z",
    ]);
  });

  it("sem Loja não consulta; muitas Lojas vão em lotes (limite de parâmetros do D1)", async () => {
    const empty = fakeD1([]);
    expect(await monthOrderCounts(empty.d1, [], "2026-11")).toEqual(new Map());
    expect(empty.calls).toHaveLength(0);

    const ids = Array.from({ length: 200 }, (_, index) => `loja-${index}`);
    const many = fakeD1([{ storeId: "loja-199", total: 3 }]);
    const counts = await monthOrderCounts(many.d1, ids, "2026-11");
    expect(many.calls).toHaveLength(3);
    expect(counts.get("loja-199")).toBe(3);
    expect(counts.size).toBe(200);
  });
});
