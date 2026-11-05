// Tabela completa de transições do Pedido (Decisão 09) e rótulos PT-BR: cada par
// (de, para) é conferido contra a lista de permitidas, nos dois tipos de atendimento.
import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./index.js";
import {
  allowedOrderTransitions,
  canTransitionOrder,
  orderStatusLabelPt,
  orderStatusSchema,
  type FulfillmentType,
  type OrderStatus,
} from "./order-status.js";

const statuses = orderStatusSchema.options;

const expected: Record<FulfillmentType, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  delivery: {
    out_for_delivery: ["completed", "cancelled"],
    preparing: ["out_for_delivery", "cancelled"],
    received: ["preparing", "cancelled"],
  },
  pickup: {
    preparing: ["ready_for_pickup", "cancelled"],
    ready_for_pickup: ["completed", "cancelled"],
    received: ["preparing", "cancelled"],
  },
};

describe("transições do Pedido: tabela completa", () => {
  for (const fulfillment of ["pickup", "delivery"] as const) {
    it(`${fulfillment}: permitidas = tabela; finais não saem do lugar`, () => {
      for (const from of statuses) {
        const allowed = expected[fulfillment][from] ?? [];
        expect(allowedOrderTransitions(fulfillment, from)).toEqual(allowed);
        for (const to of statuses) {
          expect(canTransitionOrder(fulfillment, from, to), `${from} → ${to}`).toBe(
            allowed.includes(to),
          );
        }
      }
    });
  }

  it("todo estado tem rótulo PT-BR distinto", () => {
    const labels = statuses.map(orderStatusLabelPt);
    expect(new Set(labels).size).toBe(statuses.length);
    expect(labels).toContain("Pronto para retirada");
    expect(orderStatusLabelPt("cancelled")).toBe("Cancelado");
  });

  it("contrato do /health", () => {
    expect(healthResponseSchema.parse({ service: "api", status: "ok" })).toEqual({
      service: "api",
      status: "ok",
    });
  });
});
