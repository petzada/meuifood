import { describe, expect, it } from "vitest";

import {
  previewDeliveryFeeCents,
  resolveDeliveryFeeCents,
  sanitizeDeliveryAddress,
} from "./delivery-fee.js";
import { normalizeNeighborhoodKey } from "./neighborhood.js";

describe("taxa de Delivery", () => {
  it("aplica Taxa fixa e ignora bairros residuais", () => {
    const result = resolveDeliveryFeeCents(
      {
        fixedDeliveryFeeCents: 700,
        mode: "fixed",
        neighborhoods: [
          {
            feeCents: 9999,
            name: "Centro",
            normalizedName: normalizeNeighborhoodKey("Centro"),
          },
        ],
      },
      { neighborhood: "Qualquer", streetLine: "Rua A, 10" },
    );
    expect(result).toEqual({
      feeCents: 700,
      mode: "fixed",
      neighborhoodDisplay: "Qualquer",
      ok: true,
    });
  });

  it("aplica taxa por bairro com matching normalizado", () => {
    const result = resolveDeliveryFeeCents(
      {
        fixedDeliveryFeeCents: 500,
        mode: "neighborhood",
        neighborhoods: [
          {
            feeCents: 450,
            name: "São José",
            normalizedName: normalizeNeighborhoodKey("São José"),
          },
        ],
      },
      { neighborhood: "sao  jose", streetLine: "Av. B, 20" },
    );
    expect(result).toEqual({
      feeCents: 450,
      mode: "neighborhood",
      neighborhoodDisplay: "São José",
      ok: true,
    });
  });

  it("bloqueia bairro não atendido sem usar taxa fixa residual", () => {
    const result = resolveDeliveryFeeCents(
      {
        fixedDeliveryFeeCents: 500,
        mode: "neighborhood",
        neighborhoods: [
          {
            feeCents: 450,
            name: "Centro",
            normalizedName: normalizeNeighborhoodKey("Centro"),
          },
        ],
      },
      { neighborhood: "Zona Rural", streetLine: "Rua C, 1" },
    );
    expect(result).toEqual({ ok: false, error: "neighborhood_not_served" });
  });

  it("exige streetLine e neighborhood", () => {
    expect(
      sanitizeDeliveryAddress({ neighborhood: "Centro", streetLine: "" }).ok,
    ).toBe(false);
    expect(
      resolveDeliveryFeeCents(
        { fixedDeliveryFeeCents: 100, mode: "fixed", neighborhoods: [] },
        { neighborhood: "", streetLine: "Rua" },
      ),
    ).toEqual({ ok: false, error: "invalid_address" });
  });

  it("preview não inventa taxa fora da zona", () => {
    expect(
      previewDeliveryFeeCents(
        {
          fixedDeliveryFeeCents: null,
          mode: "neighborhood",
          neighborhoods: [
            {
              feeCents: 300,
              name: "Centro",
              normalizedName: normalizeNeighborhoodKey("Centro"),
            },
          ],
        },
        "Outro",
      ),
    ).toBeNull();
    expect(
      previewDeliveryFeeCents(
        { fixedDeliveryFeeCents: 250, mode: "fixed", neighborhoods: [] },
        "Ignorado",
      ),
    ).toBe(250);
  });
});
