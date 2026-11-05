import { describe, expect, it } from "vitest";

import {
  bpsToInput,
  centsToInput,
  formatBps,
  formatCents,
  formatDateTimeSp,
  formatPeriod,
  maskCep,
  maskCnpj,
  maskCpfOrCnpj,
  maskPhoneBr,
  parseMoneyToCents,
  parsePercentToBps,
  periodState,
  utcIsoToZonedInput,
  zonedInputToUtcIso,
} from "./ops-format";

describe("dinheiro e percentual", () => {
  it("formata centavos e basis points em PT-BR", () => {
    expect(formatCents(8499).replace(/\s/g, " ")).toBe("R$ 84,99");
    expect(formatBps(349)).toBe("3,49%");
    expect(centsToInput(101988)).toBe("R$ 1.019,88");
    expect(bpsToInput(0)).toBe("0,00");
  });

  it("lê R$ e % digitados, inclusive com ponto de milhar", () => {
    expect(parseMoneyToCents("84,99")).toBe(8499);
    expect(parseMoneyToCents("R$ 1.019,88")).toBe(101988);
    expect(parseMoneyToCents("84.99")).toBe(8499);
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1,234")).toBeNull();
    expect(parsePercentToBps("3,49")).toBe(349);
    expect(parsePercentToBps("3.49%")).toBe(349);
    expect(parsePercentToBps("")).toBeNull();
  });
});

describe("vigência em São Paulo", () => {
  it("converte datetime-local de SP (UTC-3) para UTC e volta", () => {
    expect(zonedInputToUtcIso("2026-11-05T14:30")).toBe("2026-11-05T17:30:00.000Z");
    expect(zonedInputToUtcIso("2026-11-05T22:00")).toBe("2026-11-06T01:00:00.000Z");
    expect(utcIsoToZonedInput("2026-11-05T17:30:00.000Z")).toBe("2026-11-05T14:30");
    expect(zonedInputToUtcIso("")).toBeNull();
    expect(zonedInputToUtcIso("2026-13-40T99:99")).toBeNull();
  });

  it("exibe em SP e descreve a vigência", () => {
    expect(formatDateTimeSp("2026-11-05T17:30:00.000Z")).toBe("05/11/2026 14:30");
    const now = new Date("2026-11-05T12:00:00.000Z");
    expect(formatPeriod("2026-11-01T03:00:00.000Z", null, now)).toBe("desde 01/11/2026 00:00");
    expect(formatPeriod("2026-12-01T03:00:00.000Z", null, now)).toBe(
      "vale a partir de 01/12/2026 00:00",
    );
    expect(periodState("2026-12-01T03:00:00.000Z", null, now)).toBe("future");
    expect(periodState("2026-11-01T03:00:00.000Z", null, now)).toBe("current");
    expect(periodState("2026-10-01T03:00:00.000Z", "2026-11-01T03:00:00.000Z", now)).toBe("ended");
  });
});

describe("máscaras", () => {
  it("CNPJ numérico e alfanumérico, CPF/CNPJ pelo tamanho, CEP e celular", () => {
    expect(maskCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(maskCnpj("12abc678000195")).toBe("12.ABC.678/0001-95");
    expect(maskCpfOrCnpj("12345678909")).toBe("123.456.789-09");
    expect(maskCpfOrCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(maskCep("01310100")).toBe("01310-100");
    expect(maskPhoneBr("11912345678")).toBe("(11) 91234-5678");
    expect(maskPhoneBr("5511912345678")).toBe("(11) 91234-5678");
  });
});
