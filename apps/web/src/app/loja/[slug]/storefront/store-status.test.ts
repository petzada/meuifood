// Linha de estado (C1) e blocos do "Sobre a Loja" a partir do contrato do estado da Loja.
import { describe, expect, it } from "vitest";

import { storeState } from "./fixtures";
import {
  blockedCheckoutMessage,
  describeAvailability,
  formatStoreAddress,
  fulfillmentSummary,
  weeklyHours,
} from "./store-status";

// Quinta 2026-11-05 20:00 em São Paulo (UTC−3).
const NOW = Date.parse("2026-11-05T23:00:00.000Z");

describe("describeAvailability", () => {
  it("aberta mostra até quando, em horário civil de São Paulo", () => {
    const view = describeAvailability({ closesAt: "2026-11-06T02:00:00.000Z", state: "open" }, NOW);
    expect(view).toEqual({ canOrder: true, kind: "open", label: "Aberta até 23:00" });
    expect(blockedCheckoutMessage(view)).toBeNull();
  });

  it("fechada diz se abre hoje, amanhã ou no dia da semana", () => {
    const today = describeAvailability(
      {
        nextOpening: { at: "2026-11-06T01:00:00.000Z", opensAt: "22:00", weekday: 4 },
        state: "closed",
      },
      NOW,
    );
    expect(today.label).toBe("Fechada · abre hoje às 22:00");
    const tomorrow = describeAvailability(
      {
        nextOpening: { at: "2026-11-06T14:00:00.000Z", opensAt: "11:00", weekday: 5 },
        state: "closed",
      },
      NOW,
    );
    expect(tomorrow.label).toBe("Fechada · abre amanhã às 11:00");
    const monday = describeAvailability(
      {
        nextOpening: { at: "2026-11-09T21:00:00.000Z", opensAt: "18:00", weekday: 1 },
        state: "closed",
      },
      NOW,
    );
    expect(monday.label).toBe("Fechada · abre segunda às 18:00");
    expect(monday.canOrder).toBe(false);
    expect(blockedCheckoutMessage(monday)).toMatch(/fechada agora/u);
  });

  it("sem grade de horários fica só 'Fechada no momento'", () => {
    expect(describeAvailability({ nextOpening: null, state: "closed" }, NOW).label).toBe(
      "Fechada no momento",
    );
  });

  it("Pausa é um estado distinto e bloqueia o checkout", () => {
    const view = describeAvailability({ state: "paused" }, NOW);
    expect(view).toEqual({
      canOrder: false,
      kind: "paused",
      label: "Em pausa · pedidos voltam em breve",
    });
    expect(blockedCheckoutMessage(view)).toMatch(/pausou/u);
  });
});

describe("Sobre a Loja", () => {
  it("monta a grade Seg–Dom com 'Fechado' nos dias sem período", () => {
    const grid = weeklyHours(storeState.hours);
    expect(grid.map((d) => d.label)).toEqual([
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ]);
    expect(grid[4]!.periods).toEqual(["11:00–14:00", "18:00–23:00"]);
    expect(grid[1]!.periods).toEqual([]);
  });

  it("endereço e resumo de Delivery/Retirada só com o que está configurado", () => {
    expect(formatStoreAddress(storeState.pickup!.address)).toEqual({
      line1: "Rua das Flores, 100",
      line2: "Centro · São Paulo/SP",
    });
    expect(fulfillmentSummary(storeState)).toEqual([
      { detail: "40–60 min · taxa por bairro · pedido mínimo R$ 20,00", label: "Delivery" },
      { detail: "15–20 min", label: "Retirada na Loja" },
    ]);
    expect(
      fulfillmentSummary({
        delivery: null,
        pickup: { address: storeState.pickup!.address, eta: null },
      }),
    ).toEqual([{ detail: null, label: "Retirada na Loja" }]);
  });
});
