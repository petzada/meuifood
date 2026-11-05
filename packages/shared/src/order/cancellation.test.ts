// Contrato do Cancelamento (Ticket 12): entrada com motivo opcional da lista fixa (P-OPE-3),
// consequência financeira e o texto do diálogo de confirmação (CAN-01).
import { describe, expect, it } from "vitest";

import {
  CANCEL_REASON_LABELS,
  CANCEL_REASONS,
  cancellationConsequenceSchema,
  cancellationPreview,
  cancellationPreviewSchema,
  cancelOrderInputSchema,
  cancelOrderResultSchema,
  cancelReasonLabel,
  hasRefundBadge,
  orderCancellationViewSchema,
  REFUND_STATE_LABELS,
  refundAmountCents,
} from "./cancellation.js";
import { orderCancelInputSchema, orderQueueItemSchema } from "./painel.js";

const orderId = "0f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b";
const NBSP = String.fromCharCode(0xa0);

describe("cancelOrderInputSchema", () => {
  it("motivo é opcional e só da lista fixa", () => {
    expect(cancelOrderInputSchema.safeParse({ orderId }).success).toBe(true);
    for (const reason of CANCEL_REASONS) {
      expect(cancelOrderInputSchema.safeParse({ orderId, reason }).success).toBe(true);
    }
    expect(cancelOrderInputSchema.safeParse({ orderId, reason: "pix_expired" }).success).toBe(
      false,
    );
    expect(cancelOrderInputSchema.safeParse({ orderId, reason: "qualquer" }).success).toBe(false);
  });

  it("aceita o `from` do Painel do 24b e recusa id inválido", () => {
    expect(orderCancelInputSchema.safeParse({ orderId, from: "preparing" }).success).toBe(true);
    expect(cancelOrderInputSchema.safeParse({ orderId: "1" }).success).toBe(false);
  });

  it("os quatro motivos do diálogo, na ordem, com os rótulos da P-OPE-3", () => {
    expect(CANCEL_REASONS.map((reason) => CANCEL_REASON_LABELS[reason])).toEqual([
      "Item em falta",
      "Loja sem entregador",
      "Consumidor pediu",
      "Outro",
    ]);
    expect(cancelReasonLabel(null)).toBeNull();
    expect(cancelReasonLabel("pix_expired")).toBe("PIX não pago no prazo");
  });
});

describe("cancellationPreview (CAN-01)", () => {
  it("Pagamento na entrega: só o Pedido", () => {
    expect(
      cancellationPreview({
        paymentMethod: "on_delivery",
        paymentStatus: "not_required",
        totalCents: 4_500,
        serviceFeeCents: 0,
      }),
    ).toEqual({ kind: "on_delivery", text: "O Pedido será cancelado." });
  });

  it("pago: Estorno total, inclusive a tarifa de serviço (decisão 71)", () => {
    for (const paymentMethod of ["pix", "credit"] as const) {
      const preview = cancellationPreview({
        paymentMethod,
        paymentStatus: "paid",
        totalCents: 4_500,
        serviceFeeCents: 150,
      });
      expect(preview).toEqual({
        kind: "refund",
        amountCents: 4_650,
        text: `R$${NBSP}46,50 serão estornados automaticamente ao Consumidor.`,
      });
      expect(cancellationPreviewSchema.safeParse(preview).success).toBe(true);
    }
    expect(refundAmountCents({ totalCents: 0, serviceFeeCents: 150 })).toBe(150);
  });

  it("sem pagamento ainda (aguardando, vencido ou falho): a cobrança é cancelada", () => {
    for (const paymentStatus of ["awaiting", "expired", "failed"] as const) {
      expect(
        cancellationPreview({
          paymentMethod: "pix",
          paymentStatus,
          totalCents: 4_500,
          serviceFeeCents: 150,
        }),
      ).toEqual({ kind: "charge_cancel", text: "A cobrança será cancelada." });
    }
  });
});

describe("resultado e selos do Estorno (CAN-02)", () => {
  it("resultado do cancelamento: Pedido final, sem impressão, com a consequência", () => {
    const result = {
      status: "cancelled",
      next: [],
      print: false,
      reason: "no_courier",
      consequence: { kind: "refund", refund: { state: "pending", amountCents: 4_650 } },
    };
    expect(cancelOrderResultSchema.safeParse(result).success).toBe(true);
    expect(cancelOrderResultSchema.safeParse({ ...result, next: ["preparing"] }).success).toBe(
      false,
    );
    expect(cancellationConsequenceSchema.safeParse({ kind: "on_delivery" }).success).toBe(true);
    expect(cancellationConsequenceSchema.safeParse({ kind: "refund" }).success).toBe(false);
  });

  it("rótulos dos três estados e selo só em Pedido cancelado com Estorno", () => {
    expect(REFUND_STATE_LABELS).toEqual({
      pending: "Estorno em andamento",
      succeeded: "Estorno concluído",
      failed_retrying: "Estorno falhou — nova tentativa automática",
    });
    const refund = { state: "failed_retrying", amountCents: 100 } as const;
    expect(hasRefundBadge("cancelled", refund)).toBe(true);
    expect(hasRefundBadge("cancelled", null)).toBe(false);
    expect(hasRefundBadge("cancelled", undefined)).toBe(false);
    expect(hasRefundBadge("completed", refund)).toBe(false);
  });

  it("card da fila aceita o selo opcional; detalhe registra motivo e instante", () => {
    const item = {
      id: orderId,
      code: 7,
      status: "cancelled",
      fulfillment: "pickup",
      createdAt: "2026-11-05T12:00:00.000Z",
      customerName: "Ana",
      neighborhood: null,
      paymentMethod: "pix",
      totalCents: 4_500,
      next: [],
    };
    expect(orderQueueItemSchema.safeParse(item).success).toBe(true);
    expect(
      orderQueueItemSchema.safeParse({ ...item, refund: { state: "succeeded" } }).success,
    ).toBe(true);
    expect(
      orderCancellationViewSchema.safeParse({ reason: null, at: "2026-11-05T12:00:00.000Z" })
        .success,
    ).toBe(true);
  });
});
