import { describe, expect, it } from "vitest";

import {
  canTransitionDelivery,
  canTransitionOrder,
  canTransitionPickup,
  orderStatusLabelPt,
} from "./order-status.js";

describe("máquina de estados do Pedido", () => {
  it("preserva fluxo de Retirada", () => {
    expect(canTransitionPickup("received", "preparing")).toBe(true);
    expect(canTransitionPickup("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransitionPickup("ready_for_pickup", "completed")).toBe(true);
    expect(canTransitionPickup("received", "ready_for_pickup")).toBe(false);
    expect(canTransitionPickup("preparing", "out_for_delivery")).toBe(false);
  });

  it("usa Saiu para entrega no fluxo Delivery", () => {
    expect(canTransitionDelivery("preparing", "out_for_delivery")).toBe(true);
    expect(canTransitionDelivery("out_for_delivery", "completed")).toBe(true);
    expect(canTransitionDelivery("preparing", "ready_for_pickup")).toBe(false);
    expect(canTransitionOrder("delivery", "preparing", "out_for_delivery")).toBe(
      true,
    );
    expect(orderStatusLabelPt("out_for_delivery")).toBe("Saiu para entrega");
  });
});
