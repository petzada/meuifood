// Propriedades do Estorno e do Ledger (Ticket 12; decisão 67: fast-check em dinheiro,
// Estorno/Ledger e datas úteis): o Estorno devolve exatamente o que o Consumidor pagou
// (inclusive a tarifa de serviço), a reversão nunca muda os valores do lançamento, o lojista
// termina com saldo zero no Pedido cancelado (antes ou depois do repasse) e o débito compensado
// cai sempre num dia útil depois do cancelamento.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isBusinessDay, saoPauloDate } from "../business-days.js";
import { cancellationPreview } from "../order/cancellation.js";
import { feeCents, paymentLedgerSnapshot } from "./ledger.js";
import {
  planLedgerReversal,
  REFUND_RETRY_MAX_MS,
  refundRetryDelayMs,
  storePayoutBalanceCents,
} from "./refund.js";

const instant = fc
  .integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2030, 11, 31) })
  .map((ms) => new Date(ms));
const orderTotal = fc.integer({ min: 0, max: 10_000_000 });
const serviceFee = fc.integer({ min: 0, max: 500 });
const rate = fc.record({
  percentBps: fc.integer({ min: 0, max: 1_000 }),
  fixedCents: fc.integer({ min: 0, max: 500 }),
});

describe("Estorno × Ledger (propriedades)", () => {
  it("Estorno total = total do Pedido + tarifa de serviço = o que foi cobrado", () => {
    fc.assert(
      fc.property(
        orderTotal,
        serviceFee,
        rate,
        instant,
        fc.boolean(),
        (total, fee, r, at, paidOut) => {
          fc.pre(total + fee >= 1);
          const snapshot = paymentLedgerSnapshot({
            orderTotalCents: total,
            serviceFeeCents: fee,
            foodeFee: r,
            providerCostCents: null,
            releasedAt: at,
          });
          const plan = planLedgerReversal({ ...snapshot, paidOut }, at);
          const preview = cancellationPreview({
            paymentMethod: "pix",
            paymentStatus: "paid",
            totalCents: total,
            serviceFeeCents: fee,
          });
          expect(preview.kind).toBe("refund");
          expect(preview.kind === "refund" ? preview.amountCents : -1).toBe(snapshot.chargedCents);
          expect(plan.refundedCents).toBe(snapshot.chargedCents);
          expect(plan.serviceFeeCents).toBe(fee);
          expect(plan.foodeFeeCents).toBe(feeCents(total, r));
          expect(plan.netCents).toBe(snapshot.netCents);
          expect(plan.refundedCents).toBe(
            plan.netCents + plan.foodeFeeCents + plan.serviceFeeCents,
          );
        },
      ),
    );
  });

  it("lojista termina com zero no Pedido cancelado, antes ou depois do repasse", () => {
    fc.assert(
      fc.property(orderTotal, rate, instant, fc.boolean(), (total, r, at, paidOut) => {
        const snapshot = paymentLedgerSnapshot({
          orderTotalCents: total,
          serviceFeeCents: 150,
          foodeFee: r,
          providerCostCents: null,
          releasedAt: at,
        });
        const entry = { ...snapshot, paidOut };
        const plan = planLedgerReversal(entry, at);
        const alreadyPaid = paidOut ? snapshot.netCents : 0;
        const balance = storePayoutBalanceCents([entry], [plan]);
        expect(alreadyPaid + balance).toBe(0);
        expect(plan.kind).toBe(paidOut ? "compensated_debit" : "annulment");
      }),
    );
  });

  it("anulação fica no repasse do lançamento; débito num dia útil depois do cancelamento", () => {
    fc.assert(
      fc.property(rate, instant, instant, fc.boolean(), (r, paidAt, cancelledAt, paidOut) => {
        const snapshot = paymentLedgerSnapshot({
          orderTotalCents: 5_000,
          serviceFeeCents: 150,
          foodeFee: r,
          providerCostCents: null,
          releasedAt: paidAt,
        });
        const plan = planLedgerReversal({ ...snapshot, paidOut }, cancelledAt);
        if (paidOut) {
          expect(isBusinessDay(plan.expectedPayoutDate)).toBe(true);
          expect(plan.expectedPayoutDate > saoPauloDate(cancelledAt)).toBe(true);
        } else {
          expect(plan.expectedPayoutDate).toBe(snapshot.expectedPayoutDate);
        }
      }),
    );
  });

  it("outros Pedidos da Loja não mudam com a reversão de um", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ netCents: fc.integer({ min: 0, max: 1_000_000 }), paidOut: fc.boolean() }),
          {
            maxLength: 20,
          },
        ),
        fc.integer({ min: 0, max: 1_000_000 }),
        (others, net) => {
          const before = storePayoutBalanceCents(others, []);
          const cancelled = { netCents: net, paidOut: false };
          const after = storePayoutBalanceCents(
            [...others, cancelled],
            [{ kind: "annulment", netCents: net }],
          );
          expect(after).toBe(before);
        },
      ),
    );
  });

  it("espera da retentativa: positiva, não decrescente e limitada", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (attempts) => {
        const delay = refundRetryDelayMs(attempts);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(REFUND_RETRY_MAX_MS);
        expect(refundRetryDelayMs(attempts + 1)).toBeGreaterThanOrEqual(delay);
      }),
    );
  });
});
