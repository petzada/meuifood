import { describe, expect, it } from "vitest";
import notification from "./__fixtures__/notification.json";
import {
  efiEventKey,
  EfiNotificationPayloadError,
  parseEfiNotificationEvents,
  parseEfiNotificationToken,
  unseenEfiEvents,
  verifyEfiNotificationSecret,
} from "./notification.js";
import {
  classifyEfiChargeStatus,
  isEfiCancelable,
  isEfiPaidForOrder,
  isEfiRefundable,
} from "./status.js";

describe("verifyEfiNotificationSecret", () => {
  it("aceita só o segredo exato", async () => {
    await expect(verifyEfiNotificationSecret("test_secret", "test_secret")).resolves.toBe(true);
    await expect(verifyEfiNotificationSecret("test_secreT", "test_secret")).resolves.toBe(false);
    await expect(verifyEfiNotificationSecret("test_secret_mais", "test_secret")).resolves.toBe(
      false,
    );
  });

  it("recusa sem segredo configurado ou recebido", async () => {
    await expect(verifyEfiNotificationSecret("x", "")).resolves.toBe(false);
    await expect(verifyEfiNotificationSecret(null, "test_secret")).resolves.toBe(false);
  });
});

describe("parseEfiNotificationToken", () => {
  it("lê form-urlencoded", () => {
    expect(
      parseEfiNotificationToken(
        "notification=test-token-0001",
        "application/x-www-form-urlencoded",
      ),
    ).toBe("test-token-0001");
  });

  it("lê JSON, mesmo sem content-type", () => {
    expect(parseEfiNotificationToken('{"notification":"test-token-0001"}', null)).toBe(
      "test-token-0001",
    );
  });

  it("recusa vazio, grande demais ou token malformado", () => {
    expect(parseEfiNotificationToken("", null)).toBeNull();
    expect(parseEfiNotificationToken(`notification=${"a".repeat(5000)}`, null)).toBeNull();
    expect(parseEfiNotificationToken("notification=../etc", null)).toBeNull();
    expect(parseEfiNotificationToken("{quebrado", "application/json")).toBeNull();
  });
});

describe("parseEfiNotificationEvents", () => {
  it("ordena por id e normaliza", () => {
    const events = parseEfiNotificationEvents(notification.data);
    expect(events.map((event) => event.currentStatus)).toEqual(["waiting", "approved", "paid"]);
    expect(events[2]).toEqual({
      id: 3,
      type: "charge",
      chargeId: 900001,
      customId: "intent_teste_003",
      currentStatus: "paid",
      previousStatus: "approved",
      valueCents: 5990,
      createdAt: "2026-11-05 03:00:00",
      receivedByBankAt: "2026-11-05",
    });
  });

  it("formato inesperado vira erro de payload", () => {
    expect(() => parseEfiNotificationEvents({ data: "x" })).toThrow(EfiNotificationPayloadError);
  });

  it("unseenEfiEvents devolve todos os itens após o último visto, não só o último", () => {
    const events = parseEfiNotificationEvents(notification.data);
    expect(unseenEfiEvents(events, null).map((event) => event.id)).toEqual([1, 2, 3]);
    expect(unseenEfiEvents(events, 1).map((event) => event.id)).toEqual([2, 3]);
    expect(unseenEfiEvents(events, 3)).toEqual([]);
  });

  it("chave de deduplicação estável", () => {
    const [first] = parseEfiNotificationEvents(notification.data);
    expect(first && efiEventKey(first)).toBe("efi:900001:1");
  });
});

describe("status Efí", () => {
  it.each([
    ["new", "pending"],
    ["waiting", "pending"],
    ["approved", "approved"],
    ["paid", "paid"],
    ["settled", "paid"],
    ["unpaid", "declined"],
    ["refunded", "refunded"],
    ["canceled", "canceled"],
    ["contested", "contested"],
    ["algo_novo", "unknown"],
  ])("%s → %s", (status, outcome) => {
    expect(classifyEfiChargeStatus(status)).toBe(outcome);
  });

  it("política de pago é explícita (decisão do Ticket 27)", () => {
    expect(isEfiPaidForOrder("approved", "approved")).toBe(true);
    expect(isEfiPaidForOrder("approved", "paid")).toBe(false);
    expect(isEfiPaidForOrder("paid", "paid")).toBe(true);
    expect(isEfiPaidForOrder("unpaid", "approved")).toBe(false);
  });

  it("cancelável e estornável", () => {
    expect(isEfiCancelable("unpaid")).toBe(true);
    expect(isEfiCancelable("paid")).toBe(false);
    expect(isEfiRefundable("paid")).toBe(true);
    expect(isEfiRefundable("approved")).toBe(false);
  });
});
