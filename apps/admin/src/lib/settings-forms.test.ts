import { describe, expect, it } from "vitest";

import {
  parseSetCardBrands,
  parseSetFulfillment,
  parseSetHours,
  parseSetPrintOnAccept,
  periodErrors,
} from "./settings-forms";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe("parseSetHours", () => {
  it("lê a grade e aceita períodos válidos", () => {
    const result = parseSetHours(
      form({
        periodCount: "2",
        "periods.0.weekday": "1",
        "periods.0.opensAt": "11:00",
        "periods.0.closesAt": "14:00",
        "periods.1.weekday": "1",
        "periods.1.opensAt": "18:00",
        "periods.1.closesAt": "23:00",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        periods: [
          { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
          { weekday: 1, opensAt: "18:00", closesAt: "23:00" },
        ],
      },
    });
  });

  it("início ≥ fim e sobreposição viram erro no período certo", () => {
    const invalid = parseSetHours(
      form({
        periodCount: "1",
        "periods.0.weekday": "2",
        "periods.0.opensAt": "18:00",
        "periods.0.closesAt": "18:00",
      }),
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(periodErrors(invalid.errors).get(0)).toBe("O início precisa ser antes do fim.");

    const overlap = parseSetHours(
      form({
        periodCount: "2",
        "periods.0.weekday": "2",
        "periods.0.opensAt": "11:00",
        "periods.0.closesAt": "15:00",
        "periods.1.weekday": "2",
        "periods.1.opensAt": "14:00",
        "periods.1.closesAt": "18:00",
      }),
    );
    expect(overlap.ok).toBe(false);
    if (overlap.ok) return;
    expect(periodErrors(overlap.errors).get(1)).toBe(
      "Este período se sobrepõe a outro do mesmo dia.",
    );
  });

  it("grade vazia é válida (Loja sem horário fica fechada)", () => {
    expect(parseSetHours(form({ periodCount: "0" }))).toEqual({ ok: true, data: { periods: [] } });
  });
});

describe("parseSetFulfillment", () => {
  const base = {
    pickupEnabled: "on",
    deliveryMode: "neighborhood",
    neighborhoodCount: "2",
    "neighborhoods.0.id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    "neighborhoods.0.name": "Centro",
    "neighborhoods.0.feeCents": "5,00",
    "neighborhoods.0.active": "on",
    "neighborhoods.1.name": "Jardins",
    "neighborhoods.1.feeCents": "7,50",
    deliveryMinimumOrderCents: "30,00",
    "deliveryEta.minMinutes": "30",
    "deliveryEta.maxMinutes": "50",
  };

  it("converte R$ em centavos, bairro novo sem id e inativo sem o checkbox", () => {
    const result = parseSetFulfillment(form(base));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.neighborhoods).toEqual([
      { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Centro", feeCents: 500, active: true },
      { name: "Jardins", feeCents: 750, active: false },
    ]);
    expect(result.data.deliveryMinimumOrderCents).toBe(3000);
    expect(result.data.deliveryEta).toEqual({ minMinutes: 30, maxMinutes: 50 });
    expect(result.data.pickupEta).toBeNull();
    expect(result.data.fixedFeeCents).toBeNull();
  });

  it("Taxa fixa exige o valor; mín > máx é erro no campo", () => {
    const fixed = parseSetFulfillment(form({ ...base, deliveryMode: "fixed", fixedFeeCents: "" }));
    expect(fixed.ok).toBe(false);
    if (!fixed.ok) {
      expect(fixed.errors.fixedFeeCents).toBe("Informe a Taxa fixa em R$ (ex.: 5,00).");
    }
    const eta = parseSetFulfillment(
      form({ ...base, "deliveryEta.minMinutes": "60", "deliveryEta.maxMinutes": "30" }),
    );
    expect(eta.ok).toBe(false);
    if (!eta.ok) {
      expect(eta.errors["deliveryEta.minMinutes"]).toBe("O mínimo não pode passar do máximo.");
    }
  });

  it("por bairro sem bairro ativo é erro na lista", () => {
    const result = parseSetFulfillment(
      form({ ...base, neighborhoodCount: "1", "neighborhoods.0.active": "" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.neighborhoods).toBe(
        "Ative pelo menos um bairro para entregar por bairro.",
      );
    }
  });

  it("'Sem Delivery' vira modo null e mantém a lista guardada", () => {
    const result = parseSetFulfillment(form({ ...base, deliveryMode: "none" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.deliveryMode).toBeNull();
      expect(result.data.neighborhoods).toHaveLength(2);
    }
  });
});

describe("bandeiras e Imprimir ao aceitar", () => {
  it("só bandeiras da lista fixa; nenhuma marcada é válido", () => {
    expect(parseSetCardBrands(form({ debit: ["visa", "diners"], credit: "elo" }))).toEqual({
      ok: true,
      data: { debit: ["visa"], credit: ["elo"] },
    });
    expect(parseSetCardBrands(form({}))).toEqual({ ok: true, data: { debit: [], credit: [] } });
  });

  it("Imprimir ao aceitar liga com o checkbox e desliga sem ele", () => {
    expect(parseSetPrintOnAccept(form({ printOnAccept: "on" }))).toEqual({
      ok: true,
      data: { printOnAccept: true },
    });
    expect(parseSetPrintOnAccept(form({}))).toEqual({ ok: true, data: { printOnAccept: false } });
  });
});
