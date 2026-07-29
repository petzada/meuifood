import { z } from "zod";

/** Estados enxutos do MVP (Decisão 09). Ticket 08 = Retirada; Ticket 09 = Delivery. */
export const orderStatusSchema = z.enum([
  "received",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const fulfillmentTypeSchema = z.enum(["pickup", "delivery"]);
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;

/** Checkout MVP: PIX + na entrega (crédito = Ticket 11). */
export const paymentMethodSchema = z.enum(["pix", "on_delivery"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Estado canônico de pagamento do Pedido — monotônico para online. */
export const paymentStatusSchema = z.enum([
  "not_required",
  "awaiting_payment",
  "paid",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

const paymentStatusRank: Record<PaymentStatus, number> = {
  not_required: 0,
  awaiting_payment: 1,
  paid: 2,
};

export function canAdvancePaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === "not_required") return to === "not_required";
  return paymentStatusRank[to] >= paymentStatusRank[from];
}

const pickupTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  out_for_delivery: [],
  completed: [],
  cancelled: [],
};

const deliveryTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  ready_for_pickup: [],
  completed: [],
  cancelled: [],
};

export function allowedPickupTransitions(
  from: OrderStatus,
): readonly OrderStatus[] {
  return pickupTransitions[from];
}

export function allowedDeliveryTransitions(
  from: OrderStatus,
): readonly OrderStatus[] {
  return deliveryTransitions[from];
}

export function canTransitionPickup(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return pickupTransitions[from].includes(to);
}

export function canTransitionDelivery(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return deliveryTransitions[from].includes(to);
}

export function canTransitionOrder(
  fulfillmentType: FulfillmentType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return fulfillmentType === "pickup"
    ? canTransitionPickup(from, to)
    : canTransitionDelivery(from, to);
}

export function allowedOrderTransitions(
  fulfillmentType: FulfillmentType,
  from: OrderStatus,
): readonly OrderStatus[] {
  return fulfillmentType === "pickup"
    ? allowedPickupTransitions(from)
    : allowedDeliveryTransitions(from);
}

export function orderStatusLabelPt(status: OrderStatus): string {
  switch (status) {
    case "received":
      return "Recebido";
    case "preparing":
      return "Em preparo";
    case "ready_for_pickup":
      return "Pronto para retirada";
    case "out_for_delivery":
      return "Saiu para entrega";
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
  }
}
