import { describe, expect, it } from "vitest";

import {
  MAX_CENTS,
  centsSchema,
  centsToReaisInput,
  formatBRL,
  isCents,
  multiplyCents,
  percentOfCents,
  reaisToCents,
  sumCents,
} from "./money.js";

const NBSP = String.fromCharCode(0xa0);

describe("reaisToCents", () => {
  it("aceita vírgula ou ponto como decimal, com até duas casas", () => {
    expect(reaisToCents("12,50")).toBe(1250);
    expect(reaisToCents("12.50")).toBe(1250);
    expect(reaisToCents("12,5")).toBe(1250);
    expect(reaisToCents("1.5")).toBe(150);
    expect(reaisToCents("7")).toBe(700);
    expect(reaisToCents("0")).toBe(0);
  });

  it("aceita prefixo R$, espaços e milhar quando a vírgula é o decimal", () => {
    expect(reaisToCents(" R$ 1.234,56 ")).toBe(123_456);
    expect(reaisToCents("r$12,00")).toBe(1200);
    expect(reaisToCents("1.234")).toBeNull();
  });

  it("rejeita o que não é preço", () => {
    for (const raw of ["", "abc", "-1", "1,234", "1.2.3", "1,50,0", "12,", "1e3", "∞"]) {
      expect(reaisToCents(raw), raw).toBeNull();
    }
  });

  it("respeita o teto do domínio", () => {
    expect(reaisToCents("1000000,00")).toBe(MAX_CENTS);
    expect(reaisToCents("1000000,01")).toBeNull();
    expect(reaisToCents("99999999")).toBeNull();
  });
});

describe("centsToReaisInput", () => {
  it("devolve o valor que o input numérico entende", () => {
    expect(centsToReaisInput(1250)).toBe("12.50");
    expect(centsToReaisInput(5)).toBe("0.05");
    expect(centsToReaisInput(0)).toBe("0.00");
    expect(centsToReaisInput(123_456)).toBe("1234.56");
  });

  it("é inverso de reaisToCents", () => {
    for (const cents of [0, 1, 99, 100, 1250, 999_999, MAX_CENTS]) {
      expect(reaisToCents(centsToReaisInput(cents))).toBe(cents);
    }
  });

  it("recusa não inteiro", () => {
    expect(() => centsToReaisInput(12.5)).toThrow(RangeError);
  });
});

describe("formatBRL", () => {
  it("formata como o Consumidor lê, com espaço não separável", () => {
    expect(formatBRL(1250)).toBe(`R$${NBSP}12,50`);
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
    expect(formatBRL(5)).toBe(`R$${NBSP}0,05`);
    expect(formatBRL(123_456)).toBe(`R$${NBSP}1.234,56`);
    expect(formatBRL(100_000_000)).toBe(`R$${NBSP}1.000.000,00`);
    expect(formatBRL(-350)).toBe(`-R$${NBSP}3,50`);
  });

  it("bate com o Intl pt-BR do runtime", () => {
    const intl = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
    for (const cents of [0, 7, 1250, 123_456, 98_765_432]) {
      expect(formatBRL(cents)).toBe(intl.format(cents / 100));
    }
  });

  it("recusa não inteiro", () => {
    expect(() => formatBRL(0.1 + 0.2)).toThrow(RangeError);
  });
});

describe("sumCents e multiplyCents", () => {
  it("somam inteiros sem ponto flutuante", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents(new Set([2500, 300]))).toBe(2800);
    expect(multiplyCents(2500, 3)).toBe(7500);
    expect(multiplyCents(2500, 0)).toBe(0);
  });

  it("recusam operando não inteiro ou quantidade inválida", () => {
    expect(() => sumCents([1, 0.5])).toThrow(RangeError);
    expect(() => sumCents([1, Number.NaN])).toThrow(RangeError);
    expect(() => multiplyCents(100, 1.5)).toThrow(RangeError);
    expect(() => multiplyCents(100, -1)).toThrow(RangeError);
    expect(() => multiplyCents(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe("percentOfCents", () => {
  it("aplica percentual arredondando meio para cima", () => {
    expect(percentOfCents(10_000, 15)).toBe(1500);
    expect(percentOfCents(1001, 15)).toBe(150); // 150,15 → 150
    expect(percentOfCents(1003, 15)).toBe(150); // 150,45 → 150
    expect(percentOfCents(1004, 15)).toBe(151); // 150,6 → 151
    expect(percentOfCents(333, 2.5)).toBe(8); // 8,325 → 8
    expect(percentOfCents(1000, 0)).toBe(0);
  });

  it("devolve só inteiros e recusa percentual não finito", () => {
    for (const cents of [1, 33, 999, 123_457]) {
      expect(Number.isInteger(percentOfCents(cents, 15))).toBe(true);
    }
    expect(() => percentOfCents(100, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("centsSchema e isCents", () => {
  it("aceita só inteiro não negativo até o teto", () => {
    expect(centsSchema.safeParse(0).success).toBe(true);
    expect(centsSchema.safeParse(MAX_CENTS).success).toBe(true);
    expect(centsSchema.safeParse(MAX_CENTS + 1).success).toBe(false);
    expect(centsSchema.safeParse(-1).success).toBe(false);
    expect(centsSchema.safeParse(1.5).success).toBe(false);
    expect(centsSchema.safeParse("100").success).toBe(false);
    expect(isCents(100)).toBe(true);
    expect(isCents(-1)).toBe(false);
    expect(isCents(1.5)).toBe(false);
    expect(isCents("1")).toBe(false);
  });
});
