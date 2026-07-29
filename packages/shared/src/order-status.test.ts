import { describe, expect, it } from "vitest";

import {
  allowedPickupTransitions,
  canTransitionPickup,
} from "./order-status.js";

describe("máquina de estados Retirada", () => {
  it("permite somente o ciclo Recebido → Em preparo → Pronto → Concluído e Cancelado", () => {
    expect([...allowedPickupTransitions("received")]).toEqual([
      "preparing",
      "cancelled",
    ]);
    expect(canTransitionPickup("received", "preparing")).toBe(true);
    expect(canTransitionPickup("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransitionPickup("ready_for_pickup", "completed")).toBe(true);
    expect(canTransitionPickup("received", "ready_for_pickup")).toBe(false);
    expect(canTransitionPickup("received", "completed")).toBe(false);
    expect(canTransitionPickup("completed", "cancelled")).toBe(false);
    expect(canTransitionPickup("cancelled", "preparing")).toBe(false);
  });
});
