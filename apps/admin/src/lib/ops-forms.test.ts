import { describe, expect, it } from "vitest";

import {
  parseCreatePaymentFee,
  parseCreateStore,
  parsePublishPlanTiers,
  parseSetStorePlan,
  parseSuspendStore,
  parseUpdateStore,
} from "./ops-forms";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const STORE = {
  slug: "Padaria-Central",
  name: "Padaria Central",
  cnpj: "12.345.678/0001-95",
  whatsapp: "(11) 91234-5678",
  "address.postalCode": "01310-100",
  "address.street": "Av. Paulista",
  "address.number": "1000",
  "address.complement": "",
  "address.district": "Bela Vista",
  "address.city": "São Paulo",
  "address.state": "SP",
  "payout.pixKey.type": "cnpj",
  "payout.pixKey.value": "12.345.678/0001-95",
  "payout.holderName": "Padaria Central LTDA",
  "payout.holderDocument": "12.345.678/0001-95",
};

describe("cadastro da Loja", () => {
  it("normaliza máscaras e Slug pelo contrato", () => {
    const result = parseCreateStore(form(STORE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slug).toBe("padaria-central");
    expect(result.data.cnpj).toBe("12345678000195");
    expect(result.data.whatsapp).toBe("5511912345678");
    expect(result.data.address.postalCode).toBe("01310100");
    expect(result.data.address.complement).toBeNull();
    expect(result.data.payout.pixKey).toEqual({ type: "cnpj", value: "12345678000195" });
  });

  it("aponta o erro no campo certo, em PT-BR", () => {
    const result = parseCreateStore(
      form({
        ...STORE,
        slug: "ops",
        cnpj: "11.111.111/1111-11",
        "address.state": "XX",
        "address.street": "",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.slug).toBe("Slug reservado.");
    expect(result.errors.cnpj).toBe("CNPJ inválido.");
    expect(result.errors["address.state"]).toBe("Escolha o estado.");
    expect(result.errors["address.street"]).toBe("Informe a rua.");
    expect(result.errors.name).toBeUndefined();
  });

  it("edição manda só as seções marcadas", () => {
    const id = "6f1d6a1e-6f1b-4c6e-9a0b-4e3b2c1d0e9f";
    const result = parseUpdateStore(form({ ...STORE, sections: ["address"] }), id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data).sort()).toEqual(["address", "storeId"]);
    const none = parseUpdateStore(form(STORE), id);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors.form).toBe("Nada para alterar.");
  });
});

describe("estado, Plano e vigências", () => {
  const storeId = "6f1d6a1e-6f1b-4c6e-9a0b-4e3b2c1d0e9f";

  it("suspensão exige motivo", () => {
    const result = parseSuspendStore(form({ storeId, reason: "ab" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.reason).toBe("Descreva o motivo (3 a 500 caracteres).");
  });

  it("Plano com início em São Paulo vira UTC", () => {
    const result = parseSetStorePlan(
      form({ storeId, cycle: "annual", validFrom: "2026-11-05T00:00" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.validFrom).toBe("2026-11-05T03:00:00.000Z");
  });

  it("taxa Foode: R$ e % viram centavos e bp; erros voltam sem o prefixo fees.0", () => {
    const ok = parseCreatePaymentFee(
      form({
        method: "credit",
        cardMode: "rapido",
        percentBps: "5,42",
        fixedCents: "0,60",
        validFrom: "2026-11-05T00:00",
        validTo: "",
      }),
      null,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.fees[0]).toMatchObject({
        method: "credit",
        cardMode: "rapido",
        percentBps: 542,
        fixedCents: 60,
        validTo: null,
      });
    }
    const bad = parseCreatePaymentFee(
      form({ method: "pix", percentBps: "x", validFrom: "2026-11-05T10:00", validTo: "" }),
      storeId,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.percentBps).toBe("Informe o percentual (ex.: 3,49).");
    const inverted = parseCreatePaymentFee(
      form({
        method: "pix",
        percentBps: "1",
        validFrom: "2026-11-05T10:00",
        validTo: "2026-11-05T09:00",
      }),
      storeId,
    );
    expect(inverted.ok).toBe(false);
    if (!inverted.ok)
      expect(inverted.errors.validTo).toBe("O fim da vigência deve ser depois do início.");
  });

  it("faixas contíguas a partir de 0, só a última sem teto", () => {
    const base = { validFrom: "2026-12-01T00:00", annualPriceCents: "1.019,88", tierCount: "2" };
    const ok = parsePublishPlanTiers(
      form({
        ...base,
        "tiers.0.minOrders": "0",
        "tiers.0.maxOrders": "150",
        "tiers.0.priceCents": "84,99",
        "tiers.1.minOrders": "151",
        "tiers.1.maxOrders": "",
        "tiers.1.priceCents": "169,99",
      }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.annualPriceCents).toBe(101988);
    const gap = parsePublishPlanTiers(
      form({
        ...base,
        "tiers.0.minOrders": "0",
        "tiers.0.maxOrders": "150",
        "tiers.0.priceCents": "84,99",
        "tiers.1.minOrders": "160",
        "tiers.1.maxOrders": "",
        "tiers.1.priceCents": "169,99",
      }),
    );
    expect(gap.ok).toBe(false);
    if (!gap.ok) expect(gap.errors.monthlyTiers).toContain("contíguas");
  });
});
