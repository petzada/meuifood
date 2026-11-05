// Propriedades do dinheiro e das datas do Cartão (Ticket 27; decisão 67: fast-check em dinheiro,
// taxa/líquido e datas úteis): liberação prevista dentro do prazo do modo, repasse = dia útil
// seguinte, retenções como parcelas do líquido e as somas do Ledger com a tarifa de serviço.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isBusinessDay, nextBusinessDay, saoPauloDate } from "../business-days.js";
import {
  CARD_RELEASE_MAX_BUSINESS_DAYS,
  cardLedger,
  cardMaxReleaseDate,
  cardReleasePlan,
  cardRetentionParcels,
  type CardSettlementProvider,
} from "./card-settlement.js";
import { ONLINE_SERVICE_FEE_CENTS } from "./ledger.js";

const provider = fc.constantFrom<CardSettlementProvider>("efi", "abacatepay");
/** 2024–2030, em qualquer hora (inclui virada de dia entre UTC e São Paulo). */
const instant = fc
  .integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2030, 11, 31) })
  .map((ms) => new Date(ms));
const civilOffset = fc.integer({ min: -10, max: 60 });
const orderTotal = fc.integer({ min: 100, max: 10_000_000 });
const rate = fc.record({
  percentBps: fc.integer({ min: 0, max: 1_000 }),
  fixedCents: fc.integer({ min: 0, max: 500 }),
});

function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Dias úteis estritamente depois de `from` até `to` (inclusive). */
function businessDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let cursor = from; cursor < to;) {
    cursor = plusDays(cursor, 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

describe("liberação prevista do Cartão: propriedades", () => {
  it("sem data informada: dia útil exatamente N dias úteis depois da aprovação", () => {
    fc.assert(
      fc.property(provider, instant, (p, approvedAt) => {
        const plan = cardReleasePlan({ provider: p, approvedAt });
        const approvedDay = saoPauloDate(approvedAt);
        expect(plan.releaseSource).toBe("max_term");
        expect(isBusinessDay(plan.releaseDate)).toBe(true);
        expect(plan.releaseDate > approvedDay).toBe(true);
        expect(businessDaysBetween(approvedDay, plan.releaseDate)).toBe(
          CARD_RELEASE_MAX_BUSINESS_DAYS[p],
        );
      }),
    );
  });

  it("data informada válida vence o prazo; anterior à aprovação é ignorada", () => {
    fc.assert(
      fc.property(provider, instant, civilOffset, (p, approvedAt, offset) => {
        const approvedDay = saoPauloDate(approvedAt);
        const informed = plusDays(approvedDay, offset);
        const plan = cardReleasePlan({ provider: p, approvedAt, informedReleaseDate: informed });
        if (offset >= 0) {
          expect(plan).toMatchObject({ releaseDate: informed, releaseSource: "informed" });
        } else {
          expect(plan).toMatchObject({
            releaseDate: cardMaxReleaseDate(p, approvedAt),
            releaseSource: "max_term",
          });
        }
        expect(plan.releaseDate >= approvedDay).toBe(true);
      }),
    );
  });

  it("repasse previsto = 1º dia útil estritamente depois da liberação", () => {
    fc.assert(
      fc.property(provider, instant, civilOffset, (p, approvedAt, offset) => {
        const plan = cardReleasePlan({
          provider: p,
          approvedAt,
          informedReleaseDate: plusDays(saoPauloDate(approvedAt), offset),
        });
        expect(plan.expectedPayoutDate).toBe(nextBusinessDay(plan.releaseDate));
        expect(plan.expectedPayoutDate > plan.releaseDate).toBe(true);
        expect(isBusinessDay(plan.expectedPayoutDate)).toBe(true);
      }),
    );
  });
});

describe("Ledger do Cartão: propriedades", () => {
  it("somas: cobrado = total + tarifa; líquido = total − taxa Foode; tarifa nunca no líquido", () => {
    fc.assert(
      fc.property(provider, instant, orderTotal, rate, (p, approvedAt, total, foodeFee) => {
        const { ledger, release } = cardLedger({
          provider: p,
          orderTotalCents: total,
          serviceFeeCents: ONLINE_SERVICE_FEE_CENTS,
          foodeFee,
          providerCostCents: null,
          approvedAt,
        });
        expect(ledger.chargedCents).toBe(total + ONLINE_SERVICE_FEE_CENTS);
        expect(ledger.netCents).toBe(total - ledger.foodeFeeCents);
        expect(ledger.foodeFeeCents).toBeGreaterThanOrEqual(0);
        expect(ledger.foodeFeeCents).toBeLessThanOrEqual(total);
        expect(ledger.netCents + ledger.foodeFeeCents + ledger.serviceFeeCents).toBe(
          ledger.chargedCents,
        );
        expect(ledger.releaseDate).toBe(release.releaseDate);
        expect(ledger.expectedPayoutDate).toBe(release.expectedPayoutDate);
      }),
    );
  });

  it("retenções: parcelas positivas, somam o informado, ≤ líquido, nunca antes da liberação", () => {
    const retention = fc.record({
      amountCents: fc.integer({ min: 1, max: 5_000 }),
      offset: civilOffset,
    });
    fc.assert(
      fc.property(
        instant,
        fc.array(retention, { maxLength: 5 }),
        fc.integer({ min: 25_000, max: 1_000_000 }),
        (approvedAt, list, net) => {
          const main = cardReleasePlan({ provider: "efi", approvedAt }).releaseDate;
          const informed = list.map((r) => ({
            amountCents: r.amountCents,
            releaseDate: plusDays(main, r.offset),
          }));
          const parcels = cardRetentionParcels(informed, main, net);
          const sum = parcels.reduce((acc, parcel) => acc + parcel.amountCents, 0);
          expect(sum).toBe(informed.reduce((acc, r) => acc + r.amountCents, 0));
          expect(sum).toBeLessThanOrEqual(net);
          expect(new Set(parcels.map((p) => p.releaseDate)).size).toBe(parcels.length);
          for (const parcel of parcels) {
            expect(parcel.amountCents).toBeGreaterThan(0);
            expect(parcel.releaseDate >= main).toBe(true);
            expect(parcel.expectedPayoutDate).toBe(nextBusinessDay(parcel.releaseDate));
          }
        },
      ),
    );
  });

  it("retenção acima do líquido é recusada", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (net) => {
        expect(() =>
          cardRetentionParcels(
            [{ amountCents: net + 1, releaseDate: "2026-11-10" }],
            "2026-11-09",
            net,
          ),
        ).toThrow(RangeError);
      }),
    );
  });
});
