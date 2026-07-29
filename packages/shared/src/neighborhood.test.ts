import { describe, expect, it } from "vitest";

import {
  normalizeNeighborhoodKey,
  sanitizeNeighborhoodDisplayName,
} from "./neighborhood.js";

describe("normalização de bairro", () => {
  it("trata acento, caixa e espaços como a mesma chave", () => {
    expect(normalizeNeighborhoodKey("São  José")).toBe("sao jose");
    expect(normalizeNeighborhoodKey("sao jose")).toBe("sao jose");
    expect(normalizeNeighborhoodKey("  SÃO   josé ")).toBe("sao jose");
    expect(normalizeNeighborhoodKey("Sao Jose")).toBe("sao jose");
  });

  it("preserva o display sanitizado sem alterar acentuação/caixa", () => {
    expect(sanitizeNeighborhoodDisplayName("  São   José ")).toBe("São José");
    expect(sanitizeNeighborhoodDisplayName("Centro")).toBe("Centro");
  });

  it("rejeita display vazio após sanitizar", () => {
    expect(sanitizeNeighborhoodDisplayName("   ")).toBe("");
    expect(normalizeNeighborhoodKey("   ")).toBe("");
  });
});
