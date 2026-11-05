import { describe, expect, it } from "vitest";

import { publicDefaultFeesResponseSchema } from "../ops/fees.js";
import { storeSetDeliveryRateInputSchema } from "../order/settings.js";
import {
  LEAD_MESSAGES,
  leadCreateRequestSchema,
  opsListLeadsInputSchema,
  opsSetLeadStatusInputSchema,
  parseLeadInput,
} from "./index.js";

const valid = {
  name: "  Ana   Souza ",
  whatsapp: "(11) 99999-1234",
  storeName: "Burger da Ana",
  city: "São Paulo",
  ordersPerDay: "10_a_50",
};

describe("parseLeadInput", () => {
  it("normaliza textos e WhatsApp; origem opcional", () => {
    expect(parseLeadInput({ ...valid, source: " hero " })).toEqual({
      success: true,
      data: {
        name: "Ana Souza",
        whatsapp: "5511999991234",
        storeName: "Burger da Ana",
        city: "São Paulo",
        ordersPerDay: "10_a_50",
        source: "hero",
      },
    });
    const withoutSource = parseLeadInput(valid);
    expect(withoutSource.success && "source" in withoutSource.data).toBe(false);
  });

  it("origem inválida é descartada sem bloquear o lead", () => {
    const result = parseLeadInput({ ...valid, source: "x".repeat(500) });
    expect(result.success && result.data.source).toBe(undefined);
  });

  it("devolve uma mensagem por campo inválido", () => {
    expect(parseLeadInput({ whatsapp: "1234", city: " " })).toEqual({
      success: false,
      errors: {
        name: LEAD_MESSAGES.name,
        whatsapp: LEAD_MESSAGES.whatsapp,
        storeName: LEAD_MESSAGES.storeName,
        city: LEAD_MESSAGES.city,
        ordersPerDay: LEAD_MESSAGES.ordersPerDay,
      },
    });
    expect(parseLeadInput(null).success).toBe(false);
    expect(parseLeadInput({ ...valid, name: "x".repeat(81) })).toEqual({
      success: false,
      errors: { name: LEAD_MESSAGES.name },
    });
  });
});

describe("contratos da api", () => {
  it("o pedido da api leva o token do Turnstile (padrão vazio)", () => {
    const parsed = leadCreateRequestSchema.parse(valid);
    expect(parsed.turnstileToken).toBe("");
    expect(
      leadCreateRequestSchema.safeParse({ ...valid, turnstileToken: "x".repeat(2049) }).success,
    ).toBe(false);
  });

  it("RPCs do Ops validam status e id", () => {
    expect(opsListLeadsInputSchema.parse({})).toEqual({});
    expect(opsListLeadsInputSchema.safeParse({ status: "x" }).success).toBe(false);
    expect(
      opsSetLeadStatusInputSchema.safeParse({
        leadId: "7c1b0b6e-6a51-4c4e-9a59-2f9c1b2d3e4f",
        status: "contacted",
      }).success,
    ).toBe(true);
    expect(
      opsSetLeadStatusInputSchema.safeParse({ leadId: "nope", status: "contacted" }).success,
    ).toBe(false);
  });

  it("tabela pública de taxas: Crédito exige modo, PIX não tem", () => {
    expect(
      publicDefaultFeesResponseSchema.safeParse({
        fees: [
          { method: "pix", cardMode: null, percentBps: 99, fixedCents: 0 },
          { method: "credit", cardMode: "rapido", percentBps: 499, fixedCents: 50 },
        ],
      }).success,
    ).toBe(true);
    expect(
      publicDefaultFeesResponseSchema.safeParse({
        fees: [{ method: "credit", cardMode: null, percentBps: 1, fixedCents: 0 }],
      }).success,
    ).toBe(false);
  });

  it("R$/km: positivo ou null", () => {
    expect(storeSetDeliveryRateInputSchema.parse({ ratePerKmCents: 150 })).toEqual({
      ratePerKmCents: 150,
    });
    expect(storeSetDeliveryRateInputSchema.parse({ ratePerKmCents: null })).toEqual({
      ratePerKmCents: null,
    });
    expect(storeSetDeliveryRateInputSchema.safeParse({ ratePerKmCents: 0 }).success).toBe(false);
    expect(storeSetDeliveryRateInputSchema.safeParse({ ratePerKmCents: 1.5 }).success).toBe(false);
  });
});
