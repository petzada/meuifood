// Exemplos das regras do Cartão (Ticket 27): prazos por modo com feriados, data informada, taxa
// do modo (decisão 76), tarifa de serviço (decisão 71) e CPF do pagador (conta ou digitado).
import { describe, expect, it } from "vitest";

import {
  cardPaymentInputSchema,
  cardRetryResponseSchema,
  orderPixSwitchRequestSchema,
  orderPixSwitchResponseSchema,
  resolvePayerCpf,
} from "./card.js";
import {
  cardLedger,
  cardProviderOf,
  cardReleasePlan,
  cardRetentionParcels,
} from "./card-settlement.js";

// Quinta, 05/11/2026, 12h em São Paulo.
const APPROVED = new Date("2026-11-05T15:00:00.000Z");

describe("cardReleasePlan", () => {
  it("Rápido: 1 dia útil (sexta) e repasse na segunda", () => {
    expect(cardReleasePlan({ provider: "abacatepay", approvedAt: APPROVED })).toEqual({
      releaseDate: "2026-11-06",
      releaseSource: "max_term",
      expectedPayoutDate: "2026-11-09",
    });
  });

  it("Normal: 21 dias úteis pulando o feriado de 20/11 e 15/11 (domingo)", () => {
    // 06/11 … 04/12 tem 21 dias úteis sem contar 20/11 (sexta).
    expect(cardReleasePlan({ provider: "efi", approvedAt: APPROVED })).toEqual({
      releaseDate: "2026-12-07",
      releaseSource: "max_term",
      expectedPayoutDate: "2026-12-08",
    });
  });

  it("aprovação às 23h30 de sexta em São Paulo conta como sexta", () => {
    const friday = new Date("2026-11-07T02:30:00.000Z");
    expect(cardReleasePlan({ provider: "abacatepay", approvedAt: friday }).releaseDate).toBe(
      "2026-11-09",
    );
  });

  it("data informada: válida vale; inexistente ou malformada cai no prazo", () => {
    expect(
      cardReleasePlan({ provider: "efi", approvedAt: APPROVED, informedReleaseDate: "2026-11-05" }),
    ).toMatchObject({ releaseDate: "2026-11-05", releaseSource: "informed" });
    for (const bad of ["2026-02-31", "05/11/2026", ""]) {
      expect(
        cardReleasePlan({ provider: "abacatepay", approvedAt: APPROVED, informedReleaseDate: bad }),
      ).toMatchObject({ releaseSource: "max_term" });
    }
  });

  it("modo → provedor", () => {
    expect(cardProviderOf("normal")).toBe("efi");
    expect(cardProviderOf("rapido")).toBe("abacatepay");
  });
});

describe("cardLedger", () => {
  it("Normal 3,49% + R$ 0,99 sobre R$ 51,80 com tarifa R$ 1,50", () => {
    const result = cardLedger({
      provider: "efi",
      orderTotalCents: 5180,
      serviceFeeCents: 150,
      foodeFee: { percentBps: 349, fixedCents: 99 },
      providerCostCents: 186,
      approvedAt: APPROVED,
      retentions: [
        { amountCents: 500, releaseDate: "2026-12-10" },
        { amountCents: 300, releaseDate: "2026-12-10" },
        { amountCents: 200, releaseDate: "2020-01-01" },
      ],
    });
    expect(result.ledger).toEqual({
      chargedCents: 5330,
      orderTotalCents: 5180,
      serviceFeeCents: 150,
      foodeFeeCents: 280,
      providerCostCents: 186,
      netCents: 4900,
      releaseDate: "2026-12-07",
      expectedPayoutDate: "2026-12-08",
    });
    expect(result.retentions).toEqual([
      { amountCents: 200, releaseDate: "2026-12-07", expectedPayoutDate: "2026-12-08" },
      { amountCents: 800, releaseDate: "2026-12-10", expectedPayoutDate: "2026-12-11" },
    ]);
  });

  it("retenção com valor inválido é recusada", () => {
    expect(() =>
      cardRetentionParcels([{ amountCents: 0, releaseDate: "2026-12-10" }], "2026-12-07", 10),
    ).toThrow(RangeError);
  });
});

describe("respostas de Tentar outro cartão e Pagar com PIX", () => {
  it("ok com caminho relativo ou erro conhecido; corpo do PIX vazio e estrito", () => {
    expect(
      cardRetryResponseSchema.safeParse({ ok: true, trackingPath: "/loja/a/pedido/x" }).success,
    ).toBe(true);
    expect(cardRetryResponseSchema.safeParse({ error: "account_cpf_unavailable" }).success).toBe(
      true,
    );
    expect(cardRetryResponseSchema.safeParse({ error: "outro" }).success).toBe(false);
    expect(
      orderPixSwitchResponseSchema.safeParse({ ok: true, replayed: false, trackingPath: "/x" })
        .success,
    ).toBe(true);
    expect(
      orderPixSwitchResponseSchema.safeParse({ ok: true, trackingPath: "https://x" }).success,
    ).toBe(false);
    expect(orderPixSwitchRequestSchema.safeParse({}).success).toBe(true);
    expect(orderPixSwitchRequestSchema.safeParse({ method: "pix" }).success).toBe(false);
  });
});

describe("CPF do pagador", () => {
  const base = { sdk: "abacatepay", token: "ctok_teste123", brand: null, lastFour: null } as const;

  it("digitado OU o da conta, nunca os dois nem nenhum", () => {
    const typed = cardPaymentInputSchema.parse({
      ...base,
      payer: { cpf: "529.982.247-25", email: "a@b.com" },
    });
    expect(resolvePayerCpf(typed.payer, "11144477735")).toBe("52998224725");
    const account = cardPaymentInputSchema.parse({
      ...base,
      payer: { useAccountCpf: true, email: "a@b.com" },
    });
    expect(resolvePayerCpf(account.payer, "11144477735")).toBe("11144477735");
    expect(resolvePayerCpf(account.payer, null)).toBeNull();
    expect(cardPaymentInputSchema.safeParse({ ...base, payer: { email: "a@b.com" } }).success).toBe(
      false,
    );
    expect(
      cardPaymentInputSchema.safeParse({
        ...base,
        payer: { cpf: "52998224725", useAccountCpf: true, email: "a@b.com" },
      }).success,
    ).toBe(false);
  });
});
