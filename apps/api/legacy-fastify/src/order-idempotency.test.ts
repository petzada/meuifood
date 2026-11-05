import { describe, expect, it } from "vitest";

import {
  fingerprintIdempotentPayload,
  resolveIdempotentReplay,
} from "./order-idempotency.js";

describe("idempotência de Pedido", () => {
  it("fingerprint é estável à ordem das chaves", () => {
    const left = fingerprintIdempotentPayload({
      guest: { name: "Ana", phone: "5511999999999" },
      lines: [{ itemId: "a", quantity: 1 }],
    });
    const right = fingerprintIdempotentPayload({
      lines: [{ quantity: 1, itemId: "a" }],
      guest: { phone: "5511999999999", name: "Ana" },
    });
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("replay mesma chave+hash e conflito em payload divergente", () => {
    const value = { id: "order-1" };
    expect(resolveIdempotentReplay("hash-a", "hash-a", value)).toEqual({
      kind: "replay",
      value,
    });
    expect(resolveIdempotentReplay("hash-a", "hash-b", value)).toEqual({
      kind: "conflict",
    });
    expect(resolveIdempotentReplay(null, "hash-a", null)).toEqual({
      kind: "fresh",
    });
  });
});
