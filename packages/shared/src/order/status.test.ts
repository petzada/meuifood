import { describe, expect, it } from "vitest";

import {
  advanceActionLabelPt,
  allowedTransitions,
  canTransition,
  checkTransition,
  FULFILLMENTS,
  isAcceptTransition,
  isCancellable,
  nextAdvanceStatus,
  ORDER_STATUSES,
  orderStatusConsumerLabelPt,
  queueColumnOf,
  statusesOf,
} from "./status.js";

describe("máquina de estados do Pedido (decisão 09)", () => {
  it("Delivery: Recebido → Em preparo → Saiu para entrega → Concluído", () => {
    expect(nextAdvanceStatus("delivery", "received")).toBe("preparing");
    expect(nextAdvanceStatus("delivery", "preparing")).toBe("out_for_delivery");
    expect(nextAdvanceStatus("delivery", "out_for_delivery")).toBe("completed");
    expect(nextAdvanceStatus("delivery", "completed")).toBeNull();
  });

  it("Retirada: Recebido → Em preparo → Pronto para retirada → Concluído", () => {
    expect(nextAdvanceStatus("pickup", "received")).toBe("preparing");
    expect(nextAdvanceStatus("pickup", "preparing")).toBe("ready_for_pickup");
    expect(nextAdvanceStatus("pickup", "ready_for_pickup")).toBe("completed");
  });

  it("não mistura os ciclos: Retirada nunca sai para entrega e Delivery nunca fica pronto para retirada", () => {
    expect(canTransition("pickup", "preparing", "out_for_delivery")).toBe(false);
    expect(canTransition("delivery", "preparing", "ready_for_pickup")).toBe(false);
    expect(statusesOf("pickup")).not.toContain("out_for_delivery");
    expect(statusesOf("delivery")).not.toContain("ready_for_pickup");
  });

  it("sem voltar status, sem pular etapa e sem conclusão direta de Recebido", () => {
    expect(canTransition("delivery", "preparing", "received")).toBe(false);
    expect(canTransition("delivery", "received", "out_for_delivery")).toBe(false);
    expect(canTransition("pickup", "received", "completed")).toBe(false);
  });

  it("cancela de qualquer estado não final; estado final não muda mais", () => {
    for (const fulfillment of FULFILLMENTS) {
      for (const status of statusesOf(fulfillment)) {
        const final = status === "completed" || status === "cancelled";
        expect(isCancellable(fulfillment, status)).toBe(!final);
        if (final) {
          expect(allowedTransitions(fulfillment, status)).toEqual([]);
          expect(checkTransition(fulfillment, status, "preparing")).toEqual({
            ok: false,
            error: "order_final",
          });
        }
      }
    }
  });

  it("toda transição permitida leva a um estado do mesmo Fulfillment", () => {
    for (const fulfillment of FULFILLMENTS) {
      for (const from of ORDER_STATUSES) {
        for (const to of allowedTransitions(fulfillment, from)) {
          expect(statusesOf(fulfillment)).toContain(to);
          expect(checkTransition(fulfillment, from, to)).toEqual({ ok: true });
        }
      }
    }
    expect(checkTransition("pickup", "received", "ready_for_pickup")).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("aceite = Recebido → Em preparo (Imprimir ao aceitar)", () => {
    expect(isAcceptTransition("received", "preparing")).toBe(true);
    expect(isAcceptTransition("preparing", "out_for_delivery")).toBe(false);
  });

  it("colunas da fila e rótulos", () => {
    expect(queueColumnOf("ready_for_pickup")).toBe("ready");
    expect(queueColumnOf("out_for_delivery")).toBe("ready");
    expect(queueColumnOf("cancelled")).toBe("closed");
    expect(advanceActionLabelPt("out_for_delivery")).toBe("Marcar como Saiu para entrega");
    expect(orderStatusConsumerLabelPt("pickup", "completed")).toBe("Pedido retirado");
    expect(orderStatusConsumerLabelPt("delivery", "completed")).toBe("Pedido entregue");
  });
});
