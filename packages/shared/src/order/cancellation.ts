// Contrato do Cancelamento com Estorno automático (Ticket 12; decisões 39, 60, 63 P-OPE-3 e 71;
// DIRETRIZES-UX-LOJISTA CAN-01/CAN-02, T-12, PED-07). Um único comando (`ordersCancel`, Dono e
// Operador da própria Loja) cancela o Pedido e produz a consequência financeira; não existe
// comando de Estorno avulso.
//
// - Motivo opcional de uma lista curta e fixa (P-OPE-3); cancelar sem motivo continua possível.
//   O sistema também cancela (PIX vencido sem pagamento): motivo `pix_expired`, nunca escolhível.
// - Consequência: `on_delivery` (só o Pedido muda), `refund` (Estorno total — inclui a tarifa de
//   serviço, decisão 71 — no provedor que cobrou) ou `charge_cancel` (cobrança ainda sem
//   pagamento é cancelada/expirada; pagamento tardio converge para Estorno total).
// - Estado do Estorno separado do Pedido (CAN-02): `pending` (em andamento), `succeeded`
//   (concluído) ou `failed_retrying` (falhou — nova tentativa automática). O Pedido nunca reabre.
// - `cancellationPreview` é a regra pura do texto do diálogo de confirmação (CAN-01); a `api`
//   devolve a mesma pré-visualização no detalhe do Pedido.
import { z } from "zod";

import { centsSchema, formatBRL } from "../money.js";
import { type OrderStatus, orderStatusSchema, type PaymentMethod } from "./status.js";

/** Motivos que o Dono/Operador escolhem (P-OPE-3), na ordem do diálogo. */
export const CANCEL_REASONS = [
  "item_unavailable",
  "no_courier",
  "customer_request",
  "other",
] as const;
export const cancelReasonSchema = z.enum(CANCEL_REASONS);
export type CancelReason = z.infer<typeof cancelReasonSchema>;

/** Motivos do sistema (nunca escolhíveis no Painel). */
export const SYSTEM_CANCEL_REASONS = ["pix_expired"] as const;
export type SystemCancelReason = (typeof SYSTEM_CANCEL_REASONS)[number];

/** Tudo o que pode estar gravado no Pedido (`orders.cancel_reason`). */
export const ORDER_CANCEL_REASONS = [...CANCEL_REASONS, ...SYSTEM_CANCEL_REASONS] as const;
export const orderCancelReasonSchema = z.enum(ORDER_CANCEL_REASONS);
export type OrderCancelReason = z.infer<typeof orderCancelReasonSchema>;

export const CANCEL_REASON_LABELS: Readonly<Record<OrderCancelReason, string>> = {
  item_unavailable: "Item em falta",
  no_courier: "Loja sem entregador",
  customer_request: "Consumidor pediu",
  other: "Outro",
  pix_expired: "PIX não pago no prazo",
};

/**
 * Entrada de `ordersCancel`. `reason` é opcional (P-OPE-3). `from` (opcional) é o estado que o
 * Painel exibia: se outro membro já mudou o Pedido, a `api` devolve `conflict` sem gravar.
 * Cancelar duas vezes = `conflict` (nenhum segundo Estorno).
 */
export const cancelOrderInputSchema = z.object({
  orderId: z.string().uuid(),
  reason: cancelReasonSchema.optional(),
  from: orderStatusSchema.optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

/** Estado do Estorno como o Painel mostra (selo do card de Cancelados e do detalhe, CAN-02). */
export const REFUND_STATES = ["pending", "succeeded", "failed_retrying"] as const;
export const refundStateSchema = z.enum(REFUND_STATES);
export type RefundState = z.infer<typeof refundStateSchema>;

export const REFUND_STATE_LABELS: Readonly<Record<RefundState, string>> = {
  pending: "Estorno em andamento",
  succeeded: "Estorno concluído",
  failed_retrying: "Estorno falhou — nova tentativa automática",
};

/** Estorno do Pedido: valor total devolvido ao Consumidor (Pedido + tarifa de serviço). */
export const orderRefundViewSchema = z.object({
  state: refundStateSchema,
  amountCents: centsSchema,
});
export type OrderRefundView = z.infer<typeof orderRefundViewSchema>;

/** Consequência financeira do cancelamento. */
export const CANCELLATION_CONSEQUENCES = ["on_delivery", "refund", "charge_cancel"] as const;
export type CancellationConsequenceKind = (typeof CANCELLATION_CONSEQUENCES)[number];

export const cancellationConsequenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("on_delivery") }),
  z.object({ kind: z.literal("refund"), refund: orderRefundViewSchema }),
  z.object({ kind: z.literal("charge_cancel") }),
]);
export type CancellationConsequence = z.infer<typeof cancellationConsequenceSchema>;

/**
 * Saída de `ordersCancel`: o Pedido `cancelled` (sem próximos passos; nada de impressão) e a
 * consequência financeira, com o estado do Estorno quando houver.
 */
export const cancelOrderResultSchema = z.object({
  status: z.literal("cancelled"),
  next: z.array(orderStatusSchema).length(0),
  print: z.literal(false),
  reason: cancelReasonSchema.nullable(),
  consequence: cancellationConsequenceSchema,
});
export type CancelOrderResult = z.infer<typeof cancelOrderResultSchema>;

/** Cancelamento gravado no Pedido (detalhe): motivo (ou null) e quando. */
export const orderCancellationViewSchema = z.object({
  reason: orderCancelReasonSchema.nullable(),
  at: z.iso.datetime(),
});
export type OrderCancellationView = z.infer<typeof orderCancellationViewSchema>;

/** Estado do pagamento no Pedido (= `orders.payment_status`). */
export const ORDER_PAYMENT_STATUSES = [
  "not_required",
  "awaiting",
  "paid",
  "expired",
  "failed",
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export type CancellationPreviewInput = {
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  /** Total do Pedido do lojista (itens + Delivery − Cupom). */
  totalCents: number;
  /** Tarifa de serviço do pagamento online (0 no Pagamento na entrega). */
  serviceFeeCents: number;
};

export type CancellationPreview =
  | { kind: "on_delivery"; text: string }
  | { kind: "refund"; amountCents: number; text: string }
  | { kind: "charge_cancel"; text: string };

export const cancellationPreviewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("on_delivery"), text: z.string().min(1) }),
  z.object({ kind: z.literal("refund"), amountCents: centsSchema, text: z.string().min(1) }),
  z.object({ kind: z.literal("charge_cancel"), text: z.string().min(1) }),
]);

/** Valor do Estorno total: tudo o que o Consumidor pagou (Pedido + tarifa de serviço). */
export function refundAmountCents(input: { totalCents: number; serviceFeeCents: number }): number {
  return input.totalCents + input.serviceFeeCents;
}

/**
 * Texto da consequência financeira para o diálogo de confirmação (CAN-01):
 * - Pagamento na entrega: "O Pedido será cancelado.";
 * - PIX/Cartão pago: "R$ X serão estornados automaticamente ao Consumidor." (X = total + tarifa);
 * - PIX/Cartão sem pagamento: "A cobrança será cancelada.".
 */
export function cancellationPreview(input: CancellationPreviewInput): CancellationPreview {
  if (input.paymentMethod === "on_delivery" || input.paymentStatus === "not_required") {
    return { kind: "on_delivery", text: "O Pedido será cancelado." };
  }
  if (input.paymentStatus === "paid") {
    const amountCents = refundAmountCents(input);
    return {
      kind: "refund",
      amountCents,
      text: `${formatBRL(amountCents)} serão estornados automaticamente ao Consumidor.`,
    };
  }
  return { kind: "charge_cancel", text: "A cobrança será cancelada." };
}

/** Rótulo do motivo gravado (null = cancelado sem motivo). */
export function cancelReasonLabel(reason: OrderCancelReason | null): string | null {
  return reason === null ? null : CANCEL_REASON_LABELS[reason];
}

/** O Pedido tem um Estorno a acompanhar (selo próprio, separado do status). */
export function hasRefundBadge(
  status: OrderStatus,
  refund: OrderRefundView | null | undefined,
): refund is OrderRefundView {
  return status === "cancelled" && refund !== null && refund !== undefined;
}
