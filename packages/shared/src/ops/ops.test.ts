import { describe, expect, it } from "vitest";

import {
  canTransitionStore,
  findFeeOverlap,
  isEffectiveAt,
  isValidCnpj,
  isValidCpf,
  opsCreatePaymentFeesInputSchema,
  opsCreateProviderCostInputSchema,
  opsCreateStoreInputSchema,
  opsPublishPlanTiersInputSchema,
  opsSetCardModeInputSchema,
  opsSetStorePlanInputSchema,
  opsSuspendStoreInputSchema,
  opsUpdateStoreInputSchema,
  periodsOverlap,
  PLAN_TIERS_SEED,
  pixKeySchema,
  PROVIDER_COSTS_SEED,
  storeSlugSchema,
  tierForOrderCount,
  utcInstantSchema,
} from "./index.js";

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
// CNPJs/CPF de teste com dígitos verificadores válidos.
const CNPJ = "11.222.333/0001-81";
const CNPJ_ALFA = "12ABC34501DE35"; // exemplo da Receita (CNPJ alfanumérico)
const CPF = "529.982.247-25";

const validStore = {
  slug: "Pizzaria-do-Ze",
  name: " Pizzaria do Zé ",
  cnpj: CNPJ,
  whatsapp: "(11) 98765-4321",
  address: {
    postalCode: "01310-100",
    street: "Av. Paulista",
    number: "1000",
    district: "Bela Vista",
    city: "São Paulo",
    state: "SP",
  },
  payout: {
    pixKey: { type: "cnpj", value: CNPJ },
    holderName: "Pizzaria do Zé Ltda",
    holderDocument: CNPJ,
  },
};

describe("documentos", () => {
  it("valida CNPJ numérico e alfanumérico", () => {
    expect(isValidCnpj(CNPJ)).toBe(true);
    expect(isValidCnpj(CNPJ_ALFA)).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("valida CPF", () => {
    expect(isValidCpf(CPF)).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("recusa Slug reservado ou fora do formato", () => {
    expect(storeSlugSchema.parse(" Loja-Boa ")).toBe("loja-boa");
    expect(storeSlugSchema.safeParse("ops").success).toBe(false);
    expect(storeSlugSchema.safeParse("-abc").success).toBe(false);
    expect(storeSlugSchema.safeParse("ab").success).toBe(false);
  });

  it("normaliza chave Pix por tipo", () => {
    expect(pixKeySchema.parse({ type: "phone", value: "(11) 98765-4321" }).value).toBe(
      "+5511987654321",
    );
    expect(pixKeySchema.parse({ type: "email", value: " Loja@Ex.com " }).value).toBe("loja@ex.com");
    expect(pixKeySchema.safeParse({ type: "cpf", value: "123" }).success).toBe(false);
  });
});

describe("Loja", () => {
  it("aceita cadastro completo e normaliza", () => {
    const parsed = opsCreateStoreInputSchema.parse(validStore);
    expect(parsed.slug).toBe("pizzaria-do-ze");
    expect(parsed.name).toBe("Pizzaria do Zé");
    expect(parsed.cnpj).toBe("11222333000181");
    expect(parsed.whatsapp).toBe("5511987654321");
    expect(parsed.address.postalCode).toBe("01310100");
    expect(parsed.address.complement).toBeNull();
  });

  it("recusa cadastro sem dados obrigatórios ou inválidos", () => {
    expect(opsCreateStoreInputSchema.safeParse({ ...validStore, cnpj: "123" }).success).toBe(false);
    expect(
      opsCreateStoreInputSchema.safeParse({ ...validStore, whatsapp: "1133334444" }).success,
    ).toBe(false);
    expect(opsCreateStoreInputSchema.safeParse({ ...validStore, payout: undefined }).success).toBe(
      false,
    );
  });

  it("edição exige ao menos um campo", () => {
    expect(opsUpdateStoreInputSchema.safeParse({ storeId: STORE_ID }).success).toBe(false);
    expect(opsUpdateStoreInputSchema.safeParse({ storeId: STORE_ID, name: "Nova" }).success).toBe(
      true,
    );
  });

  it("suspender exige motivo; modo do cartão é normal|rapido", () => {
    expect(opsSuspendStoreInputSchema.safeParse({ storeId: STORE_ID, reason: "" }).success).toBe(
      false,
    );
    expect(
      opsSetCardModeInputSchema.safeParse({ storeId: STORE_ID, cardMode: "rapido" }).success,
    ).toBe(true);
    expect(
      opsSetCardModeInputSchema.safeParse({ storeId: STORE_ID, cardMode: "debito" }).success,
    ).toBe(false);
  });

  it("transições de estado: só ativa/suspende/reativa", () => {
    expect(canTransitionStore("onboarding", "active")).toBe(true);
    expect(canTransitionStore("suspended", "active")).toBe(true);
    expect(canTransitionStore("active", "onboarding")).toBe(false);
    expect(canTransitionStore("suspended", "onboarding")).toBe(false);
  });
});

describe("Plano e faixas", () => {
  it("a seed da decisão 61 é uma tabela válida", () => {
    const parsed = opsPublishPlanTiersInputSchema.parse({
      validFrom: "2026-11-01T00:00:00.000Z",
      ...PLAN_TIERS_SEED,
      monthlyTiers: [...PLAN_TIERS_SEED.monthlyTiers],
    });
    expect(parsed.annualPriceCents).toBe(12 * 8499);
    expect(tierForOrderCount(parsed.monthlyTiers, 150)?.priceCents).toBe(8499);
    expect(tierForOrderCount(parsed.monthlyTiers, 151)?.priceCents).toBe(16999);
    expect(tierForOrderCount(parsed.monthlyTiers, 251)?.priceCents).toBe(25499);
  });

  it("recusa faixas com buraco, sobreposição, teto na última ou preço fracionado", () => {
    const base = { validFrom: "2026-12-01T00:00:00.000Z", annualPriceCents: 101988 };
    const cases = [
      [
        { minOrders: 0, maxOrders: 150, priceCents: 8499 },
        { minOrders: 152, maxOrders: null, priceCents: 1 },
      ],
      [
        { minOrders: 0, maxOrders: 150, priceCents: 8499 },
        { minOrders: 150, maxOrders: null, priceCents: 1 },
      ],
      [{ minOrders: 0, maxOrders: 150, priceCents: 8499 }],
      [{ minOrders: 1, maxOrders: null, priceCents: 8499 }],
      [{ minOrders: 0, maxOrders: null, priceCents: 84.99 }],
    ];
    for (const monthlyTiers of cases) {
      expect(opsPublishPlanTiersInputSchema.safeParse({ ...base, monthlyTiers }).success).toBe(
        false,
      );
    }
  });

  it("Plano da Loja: ciclo mensal|anual e data normalizada para UTC", () => {
    const parsed = opsSetStorePlanInputSchema.parse({
      storeId: STORE_ID,
      cycle: "annual",
      validFrom: "2026-11-05T00:00:00-03:00",
    });
    expect(parsed.validFrom).toBe("2026-11-05T03:00:00.000Z");
    expect(
      opsSetStorePlanInputSchema.safeParse({
        storeId: STORE_ID,
        cycle: "weekly",
        validFrom: parsed.validFrom,
      }).success,
    ).toBe(false);
  });
});

describe("vigência", () => {
  const a = { validFrom: "2026-11-01T00:00:00.000Z", validTo: "2026-12-01T00:00:00.000Z" };

  it("é meio-aberta: fim de uma = início da outra não sobrepõe", () => {
    expect(periodsOverlap(a, { validFrom: "2026-12-01T00:00:00.000Z", validTo: null })).toBe(false);
    expect(periodsOverlap(a, { validFrom: "2026-11-30T23:59:59.999Z", validTo: null })).toBe(true);
    expect(
      periodsOverlap(
        { ...a, validTo: null },
        { validFrom: "2030-01-01T00:00:00.000Z", validTo: null },
      ),
    ).toBe(true);
  });

  it("taxa futura não vale hoje", () => {
    const now = "2026-11-04T12:00:00.000Z";
    expect(isEffectiveAt({ validFrom: "2026-11-05T00:00:00.000Z", validTo: null }, now)).toBe(
      false,
    );
    expect(isEffectiveAt(a, now)).toBe(true);
    expect(isEffectiveAt(a, "2026-12-01T00:00:00.000Z")).toBe(false);
  });

  it("instante inválido é recusado", () => {
    expect(utcInstantSchema.safeParse("2026-13-01T00:00:00Z").success).toBe(false);
    expect(utcInstantSchema.safeParse("2026-11-01").success).toBe(false);
  });
});

describe("taxa Foode", () => {
  const pix = { method: "pix", percentBps: 99, validFrom: "2026-11-01T00:00:00.000Z" };
  const credit = {
    method: "credit",
    cardMode: "normal",
    percentBps: 349,
    fixedCents: 0,
    validFrom: "2026-11-01T00:00:00.000Z",
    validTo: "2026-12-01T00:00:00.000Z",
  };

  it("aceita padrão e override com vigências que não se tocam", () => {
    const parsed = opsCreatePaymentFeesInputSchema.parse({
      storeId: null,
      fees: [credit, { ...credit, validFrom: "2026-12-01T00:00:00.000Z", validTo: null }, pix],
    });
    expect(parsed.fees[2]).toMatchObject({ cardMode: null, fixedCents: 0, validTo: null });
    expect(
      opsCreatePaymentFeesInputSchema.safeParse({ storeId: STORE_ID, fees: [pix] }).success,
    ).toBe(true);
  });

  it("recusa vigência sobreposta no mesmo meio/modo", () => {
    const result = opsCreatePaymentFeesInputSchema.safeParse({
      storeId: null,
      fees: [credit, { ...credit, validFrom: "2026-11-15T00:00:00.000Z", validTo: null }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["fees", 1]);
  });

  it("modos diferentes não colidem", () => {
    expect(
      findFeeOverlap([
        { method: "credit", cardMode: "normal", validFrom: credit.validFrom, validTo: null },
        { method: "credit", cardMode: "rapido", validFrom: credit.validFrom, validTo: null },
        { method: "pix", cardMode: null, validFrom: credit.validFrom, validTo: null },
      ]),
    ).toBeNull();
  });

  it("recusa crédito sem modo, PIX com modo, fim antes do início e % fora de 0–100%", () => {
    const bad = [
      { ...credit, cardMode: null },
      { ...pix, cardMode: "rapido" },
      { ...credit, validTo: credit.validFrom },
      { ...pix, percentBps: 10_001 },
      { ...pix, percentBps: 3.49 },
      { ...pix, fixedCents: -1 },
    ];
    for (const fee of bad) {
      expect(
        opsCreatePaymentFeesInputSchema.safeParse({ storeId: null, fees: [fee] }).success,
      ).toBe(false);
    }
  });
});

describe("custos dos provedores", () => {
  it("a seed atual é válida", () => {
    for (const cost of PROVIDER_COSTS_SEED) {
      expect(
        opsCreateProviderCostInputSchema.safeParse({ ...cost, validFrom: "2026-11-01T00:00:00Z" })
          .success,
      ).toBe(true);
    }
  });

  it("recusa operação que o provedor não faz (PIX de recebimento na Efí)", () => {
    expect(
      opsCreateProviderCostInputSchema.safeParse({
        provider: "efi",
        operation: "pix_charge",
        percentBps: 119,
        validFrom: "2026-11-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});
