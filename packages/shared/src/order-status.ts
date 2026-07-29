import { z } from "zod";

/** Estados enxutos do MVP (Decisão 09). Ticket 08 cobre só Retirada. */
export const orderStatusSchema = z.enum([
  "received",
  "preparing",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const fulfillmentTypeSchema = z.enum(["pickup"]);
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;

export const paymentMethodSchema = z.enum(["on_delivery"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

const pickupTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function allowedPickupTransitions(
  from: OrderStatus,
): readonly OrderStatus[] {
  return pickupTransitions[from];
}

export function canTransitionPickup(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return pickupTransitions[from].includes(to);
}

export function orderStatusLabelPt(status: OrderStatus): string {
  switch (status) {
    case "received":
      return "Recebido";
    case "preparing":
      return "Em preparo";
    case "ready_for_pickup":
      return "Pronto para retirada";
    case "completed":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
  }
}
