import type { OrderQueueItem } from "@foode/shared/order";
import { describe, expect, it } from "vitest";

import {
  countNewUnopened,
  formatElapsed,
  groupByColumn,
  paymentBadgeLabel,
  tabTitle,
  cancelToast,
  REFUND_BADGE,
  transitionToast,
  whatsappMessageFor,
  whatsappUrl,
} from "./orders-labels";

const NOW = Date.parse("2026-11-05T18:00:00.000Z");

function order(partial: Partial<OrderQueueItem> & { id: string }): OrderQueueItem {
  return {
    code: 1,
    status: "received",
    fulfillment: "delivery",
    createdAt: "2026-11-05T17:50:00.000Z",
    customerName: "Maria",
    neighborhood: "Centro",
    paymentMethod: "pix",
    totalCents: 1000,
    next: ["preparing"],
    ...partial,
  };
}

describe("rótulos da fila", () => {
  it("selo de pagamento: online x na entrega", () => {
    expect(paymentBadgeLabel("pix")).toBe("Pago online");
    expect(paymentBadgeLabel("credit")).toBe("Pago online");
    expect(paymentBadgeLabel("on_delivery")).toBe("Pagar na entrega");
  });

  it("tempo decorrido, nunca contagem regressiva", () => {
    expect(formatElapsed("2026-11-05T17:59:40.000Z", NOW)).toBe("agora");
    expect(formatElapsed("2026-11-05T17:56:00.000Z", NOW)).toBe("há 4 min");
    expect(formatElapsed("2026-11-05T16:48:00.000Z", NOW)).toBe("há 1 h 12 min");
    expect(formatElapsed("2026-11-05T16:00:00.000Z", NOW)).toBe("há 2 h");
  });

  it("aba conta só Recebidos não abertos", () => {
    const orders = [
      order({ id: "a" }),
      order({ id: "b" }),
      order({ id: "c", status: "preparing" }),
    ];
    expect(countNewUnopened(orders, new Set(["a"]))).toBe(1);
    expect(tabTitle(2)).toBe("(2) Pedidos · Foode");
    expect(tabTitle(0)).toBe("Pedidos · Foode");
  });

  it("agrupa por coluna, filtra pelo chip e ordena do mais antigo", () => {
    const orders = [
      order({ id: "a", createdAt: "2026-11-05T17:55:00.000Z" }),
      order({ id: "b", createdAt: "2026-11-05T17:50:00.000Z", fulfillment: "pickup" }),
      order({ id: "c", status: "out_for_delivery" }),
      order({ id: "d", status: "ready_for_pickup", fulfillment: "pickup" }),
      order({ id: "e", status: "completed" }),
    ];
    const all = groupByColumn(orders, "all");
    expect(all.received.map((o) => o.id)).toEqual(["b", "a"]);
    expect(all.ready.map((o) => o.id)).toEqual(["c", "d"]);
    expect(groupByColumn(orders, "pickup").received.map((o) => o.id)).toEqual(["b"]);
    expect(groupByColumn(orders, "delivery").ready.map((o) => o.id)).toEqual(["c"]);
  });

  it("toast específico por destino", () => {
    expect(transitionToast(123, "preparing")).toBe("Pedido #123 em preparo.");
    expect(transitionToast(123, "out_for_delivery")).toBe("Pedido #123 saiu para entrega.");
  });

  it("toast do cancelamento nomeia a consequência (Ticket 12)", () => {
    expect(cancelToast(123, { kind: "on_delivery" })).toBe("Pedido #123 cancelado.");
    expect(
      cancelToast(123, { kind: "refund", refund: { state: "pending", amountCents: 5639 } }),
    ).toBe("Pedido #123 cancelado. Estorno de R$\u00a056,39 em andamento.");
    expect(cancelToast(123, { kind: "charge_cancel" })).toBe(
      "Pedido #123 cancelado. A cobrança foi cancelada.",
    );
  });

  it("selo do Estorno: texto do contrato + símbolo + cor (T-03)", () => {
    expect(REFUND_BADGE.pending.tone).toBe("accent");
    expect(REFUND_BADGE.succeeded.tone).toBe("success");
    expect(REFUND_BADGE.failed_retrying).toMatchObject({
      tone: "error",
      label: "Estorno falhou — nova tentativa automática",
    });
  });

  it("WhatsApp: texto fixo por status com o link de acompanhamento", () => {
    const text = whatsappMessageFor({
      status: "out_for_delivery",
      fulfillment: "delivery",
      code: 42,
      customerFirstName: "Maria",
      storeName: "Pizza do Zé",
      trackingUrl: "https://foodedelivery.com.br/loja/pizza-do-ze/pedido/tok",
    });
    expect(text).toBe(
      "Olá, Maria! Aqui é da Pizza do Zé. O seu Pedido #42 saiu para entrega.\nAcompanhe por aqui: https://foodedelivery.com.br/loja/pizza-do-ze/pedido/tok",
    );
    expect(whatsappUrl("5511987654321", text)).toBe(
      `https://wa.me/5511987654321?text=${encodeURIComponent(text)}`,
    );
  });
});
