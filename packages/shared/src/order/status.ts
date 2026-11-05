// Estados do Pedido e transições válidas por Fulfillment (decisão 09; Tickets 08/09 → 24a/24b).
// Módulo único: a `api` confere a transição antes do UPDATE condicional, o Painel (24b) mostra só
// os botões que este módulo permite e a página do Pedido usa os rótulos do Consumidor.
// Sem "voltar status" (PED-03), sem conclusão automática (09) e sem aceite automático (P-OPE-1).
import { z } from "zod";

export const ORDER_STATUSES = [
  "received",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Como o Pedido chega ao Consumidor. Código em inglês; na tela, Delivery e Retirada. */
export const FULFILLMENTS = ["delivery", "pickup"] as const;
export const fulfillmentSchema = z.enum(FULFILLMENTS);
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

/**
 * Meio de pagamento do Pedido. `on_delivery` é único, sem subtipo (P-4.1, P-CFG-3); `pix` e
 * `credit` só ficam disponíveis com taxa Foode vigente (Tickets 26/27, decisão 61).
 */
export const PAYMENT_METHODS = ["pix", "credit", "on_delivery"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const ONLINE_PAYMENT_METHODS = ["pix", "credit"] as const satisfies readonly PaymentMethod[];

const TRANSITIONS: Readonly<
  Record<Fulfillment, Readonly<Record<OrderStatus, readonly OrderStatus[]>>>
> = {
  delivery: {
    received: ["preparing", "cancelled"],
    preparing: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["completed", "cancelled"],
    ready_for_pickup: [],
    completed: [],
    cancelled: [],
  },
  pickup: {
    received: ["preparing", "cancelled"],
    preparing: ["ready_for_pickup", "cancelled"],
    ready_for_pickup: ["completed", "cancelled"],
    out_for_delivery: [],
    completed: [],
    cancelled: [],
  },
};

/** Estado de um Pedido recém-criado. */
export const INITIAL_ORDER_STATUS: OrderStatus = "received";

/** Estados em que o Pedido pode estar, conforme o Fulfillment. */
export function statusesOf(fulfillment: Fulfillment): readonly OrderStatus[] {
  return fulfillment === "delivery"
    ? ["received", "preparing", "out_for_delivery", "completed", "cancelled"]
    : ["received", "preparing", "ready_for_pickup", "completed", "cancelled"];
}

export function allowedTransitions(
  fulfillment: Fulfillment,
  from: OrderStatus,
): readonly OrderStatus[] {
  return TRANSITIONS[fulfillment][from];
}

export function canTransition(
  fulfillment: Fulfillment,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return TRANSITIONS[fulfillment][from].includes(to);
}

export function isFinalStatus(status: OrderStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** O Pedido ainda pode ser cancelado (Dono ou Operador; Estorno é do Ticket 12). */
export function isCancellable(fulfillment: Fulfillment, status: OrderStatus): boolean {
  return canTransition(fulfillment, status, "cancelled");
}

/** Próximo passo do botão de avanço (sem o cancelar); null em estado final. */
export function nextAdvanceStatus(fulfillment: Fulfillment, from: OrderStatus): OrderStatus | null {
  return allowedTransitions(fulfillment, from).find((to) => to !== "cancelled") ?? null;
}

export type TransitionCheck =
  { ok: true } | { ok: false; error: "invalid_transition" | "order_final" };

/** Confere uma transição pedida pelo Painel. Estado final não muda mais. */
export function checkTransition(
  fulfillment: Fulfillment,
  from: OrderStatus,
  to: OrderStatus,
): TransitionCheck {
  if (isFinalStatus(from)) return { ok: false, error: "order_final" };
  return canTransition(fulfillment, from, to)
    ? { ok: true }
    : { ok: false, error: "invalid_transition" };
}

/** Coluna da fila do Painel (PED-01): Pronto para retirada e Saiu para entrega dividem a 3ª. */
export type QueueColumn = "received" | "preparing" | "ready" | "closed";

export function queueColumnOf(status: OrderStatus): QueueColumn {
  switch (status) {
    case "received":
      return "received";
    case "preparing":
      return "preparing";
    case "ready_for_pickup":
    case "out_for_delivery":
      return "ready";
    case "completed":
    case "cancelled":
      return "closed";
  }
}

/** Rótulo do estado no Painel (glossário, T-11). */
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

/** Rótulo do estado na página do Pedido, na linguagem do Consumidor (§6 das diretrizes). */
export function orderStatusConsumerLabelPt(fulfillment: Fulfillment, status: OrderStatus): string {
  switch (status) {
    case "received":
      return "Pedido recebido pela Loja";
    case "preparing":
      return "Seu pedido está sendo preparado";
    case "ready_for_pickup":
      return "Pronto para retirar na Loja";
    case "out_for_delivery":
      return "Saiu para entrega";
    case "completed":
      return fulfillment === "delivery" ? "Pedido entregue" : "Pedido retirado";
    case "cancelled":
      return "Pedido cancelado";
  }
}

/** Rótulo do botão de avanço com o destino explícito (PED-03, T-11). */
export function advanceActionLabelPt(to: OrderStatus): string {
  switch (to) {
    case "preparing":
      return "Começar preparo";
    case "ready_for_pickup":
      return "Marcar como Pronto para retirada";
    case "out_for_delivery":
      return "Marcar como Saiu para entrega";
    case "completed":
      return "Concluir";
    case "cancelled":
      return "Cancelar Pedido";
    case "received":
      return "Recebido";
  }
}

/** "Aceitar" o Pedido = sair de Recebido para Em preparo; com "Imprimir ao aceitar" abre a impressão (P-IMP-1). */
export function isAcceptTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === "received" && to === "preparing";
}

export function paymentMethodLabelPt(method: PaymentMethod): string {
  switch (method) {
    case "pix":
      return "PIX";
    case "credit":
      return "Cartão de crédito";
    case "on_delivery":
      return "Pagamento na entrega";
  }
}
