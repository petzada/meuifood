// @vitest-environment node
// Sugestão de taxa por km (decisão 73), máscara de dinheiro (item 10d) e o geocodificador com
// fila de 1 req/s e cache — tudo sem rede (fetch dublê).
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FIXED_KM,
  haversineKm,
  neighborhoodQuery,
  routeKm,
  suggestedFeeCents,
  suggestedFixedFeeCents,
  suggestedMinimumOrderCents,
} from "./delivery-suggestion";
import { createGeocoder } from "./geocode";
import { formatMoneyInput, isMaskedMoney, maskMoneyInput } from "./money-mask";
import { parseMoneyToCents } from "./ops-format";

const SE = { lat: -23.5503, lng: -46.6339 }; // Praça da Sé
const PAULISTA = { lat: -23.5614, lng: -46.6559 }; // Av. Paulista (MASP)

describe("sugestão de taxa por km", () => {
  it("haversine em km e rota = linha reta × 1,3", () => {
    const straight = haversineKm(SE, PAULISTA);
    expect(straight).toBeGreaterThan(2.4);
    expect(straight).toBeLessThan(2.7);
    expect(routeKm(SE, PAULISTA)).toBeCloseTo(straight * 1.3, 6);
    expect(haversineKm(SE, SE)).toBe(0);
  });

  it("taxa do bairro = distância × R$/km; sem R$/km ou distância = 0", () => {
    expect(suggestedFeeCents(3.4, 200)).toBe(680);
    expect(suggestedFeeCents(3.4, null)).toBe(0);
    expect(suggestedFeeCents(0, 200)).toBe(0);
    expect(suggestedFeeCents(Number.NaN, 200)).toBe(0);
  });

  it("Taxa fixa = R$/km × média dos bairros (ou 3 km) e Pedido mínimo = 3× a taxa", () => {
    expect(suggestedFixedFeeCents([2, 4, Number.NaN], 250)).toBe(750);
    expect(suggestedFixedFeeCents([], 250)).toBe(DEFAULT_FIXED_KM * 250);
    expect(suggestedMinimumOrderCents(750)).toBe(2250);
  });

  it("consulta do bairro na cidade da Loja; nome curto ou sem cidade = sem consulta", () => {
    expect(neighborhoodQuery(" Centro ", { city: "Campinas", state: "SP" })).toBe(
      "Centro, Campinas - SP, Brasil",
    );
    expect(neighborhoodQuery("C", { city: "Campinas", state: "SP" })).toBeNull();
    expect(neighborhoodQuery("Centro", { city: " ", state: "SP" })).toBeNull();
  });
});

describe("máscara de dinheiro R$ 0,00", () => {
  it("digitação em centavos com milhar e sem zeros à esquerda", () => {
    expect(maskMoneyInput("1")).toBe("R$ 0,01");
    expect(maskMoneyInput("129")).toBe("R$ 1,29");
    expect(maskMoneyInput("R$ 1,290")).toBe("R$ 12,90");
    expect(maskMoneyInput("123456")).toBe("R$ 1.234,56");
    expect(maskMoneyInput("000")).toBe("R$ 0,00");
    expect(maskMoneyInput("abc")).toBe("");
    expect(maskMoneyInput("9999999999999")).toBe("R$ 9.999.999,99");
  });

  it("formato válido e aceito pelo parser das actions", () => {
    expect(formatMoneyInput(101988)).toBe("R$ 1.019,88");
    expect(isMaskedMoney("R$ 1.019,88")).toBe(true);
    expect(isMaskedMoney("")).toBe(true);
    expect(isMaskedMoney("10,5")).toBe(false);
    expect(parseMoneyToCents(maskMoneyInput("123456"))).toBe(123456);
  });
});

describe("geocodificador (Nominatim)", () => {
  it("1 req/s, cache em memória e falha silenciosa", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("Inexistente")) return new Response("[]", { status: 200 });
      if (url.includes("Erro")) return new Response("x", { status: 500 });
      return Response.json([{ lat: "-23.55", lon: "-46.63" }]);
    });
    const geo = createGeocoder(fetcher as unknown as typeof fetch);

    const first = geo.locate("Centro, Campinas - SP, Brasil");
    const second = geo.locate("Inexistente, Campinas - SP, Brasil");
    const cached = geo.locate("centro, campinas - sp, brasil");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await expect(first).resolves.toEqual({ lat: -23.55, lng: -46.63 });
    await expect(cached).resolves.toEqual({ lat: -23.55, lng: -46.63 });
    await expect(second).resolves.toBeNull();
    const failed = geo.locate("Erro, X - SP, Brasil");
    await vi.advanceTimersByTimeAsync(1100);
    await expect(failed).resolves.toBeNull();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("countrycodes=br");
    vi.useRealTimers();
  });
});
