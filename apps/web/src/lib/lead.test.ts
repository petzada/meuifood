import { describe, expect, it } from "vitest";

import { parseLeadInput } from "./lead";

describe("parseLeadInput", () => {
  it("normaliza o WhatsApp e apara os textos", () => {
    const result = parseLeadInput({
      name: "  Ana   Souza ",
      whatsapp: "(11) 99999-1234",
      storeName: "Burger da Ana",
      city: "São Paulo",
      ordersPerDay: "ate_10",
      source: "hero",
    });
    expect(result).toEqual({
      success: true,
      data: {
        name: "Ana Souza",
        whatsapp: "5511999991234",
        storeName: "Burger da Ana",
        city: "São Paulo",
        ordersPerDay: "ate_10",
        source: "hero",
      },
    });
  });

  it("recusa telefone fixo, nome curto e opção inválida de pedidos/dia", () => {
    const result = parseLeadInput({
      name: "A",
      whatsapp: "(11) 3333-1234",
      storeName: "Loja",
      city: "Rio",
      ordersPerDay: "muitos",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.errors).sort()).toEqual(["name", "ordersPerDay", "whatsapp"]);
  });

  it("ignora `source` vazio e aceita corpo que não é objeto", () => {
    expect(parseLeadInput(null).success).toBe(false);
    const result = parseLeadInput({
      name: "Ana",
      whatsapp: "11999991234",
      storeName: "Loja",
      city: "Rio",
      ordersPerDay: "mais_de_50",
      source: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect("source" in result.data).toBe(false);
  });
});
