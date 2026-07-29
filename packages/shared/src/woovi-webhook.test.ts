import { describe, expect, it } from "vitest";

import {
  canAdvanceChargeStatus,
  parseWooviWebhookPayload,
} from "./woovi-webhook.js";

describe("parser webhook Woovi", () => {
  it("aceita CHARGE_COMPLETED representativo e preserva correlação", () => {
    const parsed = parseWooviWebhookPayload({
      charge: {
        correlationID: "foode-order-abc",
        status: "COMPLETED",
        transactionID: "tx-1",
        value: 1500,
      },
      event: "OPENPIX:CHARGE_COMPLETED",
      pix: { value: "15.00" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.event.correlationId).toBe("foode-order-abc");
    expect(parsed.event.status).toBe("COMPLETED");
    expect(parsed.event.providerEventId).toContain("OPENPIX:CHARGE_COMPLETED");
    expect(parsed.event.providerEventId).toContain("foode-order-abc");
  });

  it("rejeita payload incompatível", () => {
    expect(parseWooviWebhookPayload({ event: "UNKNOWN" }).ok).toBe(false);
    expect(parseWooviWebhookPayload(null).ok).toBe(false);
  });

  it("não permite regressão COMPLETED → ACTIVE", () => {
    expect(canAdvanceChargeStatus("COMPLETED", "ACTIVE")).toBe(false);
    expect(canAdvanceChargeStatus("ACTIVE", "COMPLETED")).toBe(true);
    expect(canAdvanceChargeStatus("COMPLETED", "COMPLETED")).toBe(true);
  });
});
