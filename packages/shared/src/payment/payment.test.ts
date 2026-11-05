// Regras de dinheiro do pagamento online (taxa Foode, tarifa de serviço, Ledger D+1 útil) e o
// contrato público do PIX. Propriedades com fast-check: nada de centavo some ou aparece.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isBusinessDay } from "../business-days.js";
import { MAX_CENTS } from "../money.js";
import {
  feeCents,
  ONLINE_SERVICE_FEE_CENTS,
  paymentLedgerSnapshot,
  serviceFeeCentsFor,
} from "./ledger.js";
import {
  formatCountdownPt,
  isPixAwaiting,
  orderPixSchema,
  PIX_STATES,
  pixSecondsLeft,
  pixStateLabelPt,
  safePixQrDataUrl,
} from "./pix.js";

const cents = fc.integer({ min: 0, max: MAX_CENTS });
const rate = fc.record({
  percentBps: fc.integer({ min: 0, max: 10_000 }),
  fixedCents: fc.integer({ min: 0, max: 1_000 }),
});
const instant = fc
  .integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2035, 11, 31) })
  .map((ms) => new Date(ms));

describe("tarifa de serviço (decisão 71)", () => {
  it("R$ 1,50 no PIX e no Cartão; zero no Pagamento na entrega", () => {
    expect(ONLINE_SERVICE_FEE_CENTS).toBe(150);
    expect(serviceFeeCentsFor("pix")).toBe(150);
    expect(serviceFeeCentsFor("credit")).toBe(150);
    expect(serviceFeeCentsFor("on_delivery")).toBe(0);
  });
});

describe("feeCents", () => {
  it("arredonda meio-para-cima e soma o fixo", () => {
    expect(feeCents(10_000, { percentBps: 99, fixedCents: 0 })).toBe(99);
    expect(feeCents(5_050, { percentBps: 99, fixedCents: 0 })).toBe(50); // 49,995 → 50
    expect(feeCents(5_000, { percentBps: 99, fixedCents: 10 })).toBe(60); // 49,5 → 50 + 10
    expect(feeCents(0, { percentBps: 99, fixedCents: 10 })).toBe(0);
  });

  it("recusa taxa ou base fora do domínio", () => {
    expect(() => feeCents(-1, { percentBps: 0, fixedCents: 0 })).toThrow(RangeError);
    expect(() => feeCents(100, { percentBps: 10_001, fixedCents: 0 })).toThrow(RangeError);
    expect(() => feeCents(100, { percentBps: 1.5, fixedCents: 0 })).toThrow(RangeError);
    expect(() => feeCents(100, { percentBps: 0, fixedCents: -1 })).toThrow(RangeError);
  });

  it("propriedade: 0 ≤ taxa ≤ base e cresce com a base", () => {
    fc.assert(
      fc.property(cents, cents, rate, (a, b, r) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        const fee = feeCents(low, r);
        expect(fee).toBeGreaterThanOrEqual(0);
        expect(fee).toBeLessThanOrEqual(low);
        expect(feeCents(high, r)).toBeGreaterThanOrEqual(fee);
      }),
    );
  });
});

describe("paymentLedgerSnapshot", () => {
  it("PIX numa sexta 23h30 em São Paulo: liberação sexta, repasse na segunda útil", () => {
    const snapshot = paymentLedgerSnapshot({
      orderTotalCents: 5_680,
      serviceFeeCents: 150,
      foodeFee: { percentBps: 99, fixedCents: 0 },
      providerCostCents: 54,
      releasedAt: new Date("2026-11-07T02:30:00.000Z"), // sexta 06/11 23h30 em SP
    });
    expect(snapshot).toEqual({
      chargedCents: 5_830,
      orderTotalCents: 5_680,
      serviceFeeCents: 150,
      foodeFeeCents: 56,
      providerCostCents: 54,
      netCents: 5_624,
      releaseDate: "2026-11-06",
      expectedPayoutDate: "2026-11-09",
    });
  });

  it("feriado nacional empurra o repasse (20/11, Consciência Negra)", () => {
    const snapshot = paymentLedgerSnapshot({
      orderTotalCents: 1_000,
      serviceFeeCents: 150,
      foodeFee: { percentBps: 0, fixedCents: 0 },
      providerCostCents: null,
      releasedAt: new Date("2026-11-19T15:00:00.000Z"),
    });
    expect(snapshot.releaseDate).toBe("2026-11-19");
    expect(snapshot.expectedPayoutDate).toBe("2026-11-23");
    expect(snapshot.providerCostCents).toBeNull();
  });

  it("recusa valores fora do domínio", () => {
    const base = {
      orderTotalCents: 100,
      serviceFeeCents: 150,
      foodeFee: { percentBps: 0, fixedCents: 0 },
      providerCostCents: null,
      releasedAt: new Date(),
    };
    expect(() => paymentLedgerSnapshot({ ...base, orderTotalCents: 1.5 })).toThrow(RangeError);
    expect(() => paymentLedgerSnapshot({ ...base, serviceFeeCents: -1 })).toThrow(RangeError);
    expect(() => paymentLedgerSnapshot({ ...base, providerCostCents: -1 })).toThrow(RangeError);
  });

  it("propriedade: tarifa nunca entra no líquido; somas fecham; repasse em dia útil depois", () => {
    fc.assert(
      fc.property(cents, rate, instant, fc.option(cents, { nil: null }), (total, r, at, cost) => {
        const s = paymentLedgerSnapshot({
          orderTotalCents: total,
          serviceFeeCents: ONLINE_SERVICE_FEE_CENTS,
          foodeFee: r,
          providerCostCents: cost,
          releasedAt: at,
        });
        expect(s.chargedCents).toBe(total + ONLINE_SERVICE_FEE_CENTS);
        expect(s.netCents + s.foodeFeeCents).toBe(total);
        expect(s.netCents).toBeGreaterThanOrEqual(0);
        expect(s.netCents).toBeLessThanOrEqual(total);
        expect(s.expectedPayoutDate > s.releaseDate).toBe(true);
        expect(isBusinessDay(s.expectedPayoutDate)).toBe(true);
      }),
    );
  });
});

describe("contrato do PIX", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";

  it("aceita só PNG em data URL no QR", () => {
    expect(safePixQrDataUrl(png)).toBe(png);
    expect(safePixQrDataUrl("javascript:alert(1)")).toBeNull();
    expect(safePixQrDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(safePixQrDataUrl(null)).toBeNull();
    expect(safePixQrDataUrl(`data:image/png;base64,${"A".repeat(200_001)}`)).toBeNull();
    expect(
      orderPixSchema.safeParse({
        state: "pending",
        amountCents: 5_830,
        copyPaste: "000201...",
        qrCodeDataUrl: "https://evil.example/qr.png",
        expiresAt: "2026-11-05T15:30:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("contagem regressiva e segundos restantes", () => {
    const now = Date.parse("2026-11-05T15:00:00.000Z");
    expect(pixSecondsLeft("2026-11-05T15:29:59.500Z", now)).toBe(1800);
    expect(pixSecondsLeft("2026-11-05T14:00:00.000Z", now)).toBe(0);
    expect(pixSecondsLeft(null, now)).toBe(0);
    expect(pixSecondsLeft("lixo", now)).toBe(0);
    expect(formatCountdownPt(1799)).toBe("29:59");
    expect(formatCountdownPt(65)).toBe("1:05");
    expect(formatCountdownPt(3_600)).toBe("1:00:00");
    expect(formatCountdownPt(-3)).toBe("0:00");
  });

  it("rótulos e estados que seguem consultando", () => {
    expect(PIX_STATES.map(pixStateLabelPt)).toEqual([
      "Gerando o PIX",
      "Aguardando pagamento",
      "Pagamento confirmado",
      "PIX expirado",
      "Não foi possível gerar o PIX",
    ]);
    expect(PIX_STATES.filter(isPixAwaiting)).toEqual(["creating", "pending"]);
  });
});
