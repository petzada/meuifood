// Contrato do Painel sobre o Pedido (Ticket 24b consome; criado no 24a): entradas e visões da
// fila, do detalhe e das transições. O Painel só mostra transições de `allowedTransitions`; a
// `api` confere de novo e grava com UPDATE condicional no estado que o Painel viu (`from`).
import { z } from "zod";

import { centsSchema } from "../money.js";
import {
  type CancellationPreview,
  type CancelOrderInput,
  cancelOrderInputSchema,
  type OrderCancellationView,
  type OrderRefundView,
  refundStateSchema,
} from "./cancellation.js";
import { phoneE164Schema } from "./checkout.js";
import { type EtaRange } from "./settings.js";
import {
  type Fulfillment,
  fulfillmentSchema,
  type OrderStatus,
  orderStatusSchema,
  type PaymentMethod,
  paymentMethodSchema,
} from "./status.js";
import type { OrderAddressView, OrderLineView } from "./storefront.js";

/** Intervalo do polling da fila (decisão 23). */
export const ORDER_QUEUE_POLL_INTERVAL_MS = 10_000;

/** Chips "Todos / Delivery / Retirada" (P-OPE-2); sem busca. */
export const QUEUE_FILTERS = ["all", "delivery", "pickup"] as const;
export const queueFilterSchema = z.enum(QUEUE_FILTERS);
export type QueueFilter = z.infer<typeof queueFilterSchema>;

/**
 * Fila: `active` = Pedidos fora de estado final (colunas PED-01); `closed_today` = Concluídos e
 * Cancelados do dia civil de São Paulo ("Concluídos hoje (N)").
 */
export const ordersListInputSchema = z.object({
  filter: queueFilterSchema.default("all"),
  scope: z.enum(["active", "closed_today"]).default("active"),
});
export type OrdersListInput = z.input<typeof ordersListInputSchema>;

export const orderRefInputSchema = z.object({ orderId: z.string().uuid() });
export type OrderRefInput = z.infer<typeof orderRefInputSchema>;

/**
 * Avanço do Pedido. `from` = estado que o Painel exibia: se outro membro já mudou o Pedido, a
 * `api` devolve `conflict` sem gravar. Cancelar tem RPC própria (`ordersCancel`).
 */
export const orderTransitionInputSchema = z
  .object({
    orderId: z.string().uuid(),
    from: orderStatusSchema,
    to: orderStatusSchema,
  })
  .refine((input) => input.to !== "cancelled", {
    message: "use ordersCancel",
    path: ["to"],
  });
export type OrderTransitionInput = z.infer<typeof orderTransitionInputSchema>;

/**
 * Cancelamento (24b; Estorno automático e motivo no Ticket 12): o mesmo contrato de
 * `cancelOrderInputSchema` (cancellation.ts). Mantido com este nome para o Painel do 24b.
 */
export const orderCancelInputSchema = cancelOrderInputSchema;
export type OrderCancelInput = CancelOrderInput;

/** Card da fila (PED-02): telefone e endereço completos só no detalhe. */
export type OrderQueueItem = {
  id: string;
  code: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  createdAt: string;
  customerName: string;
  /** Bairro do Delivery; null na Retirada. */
  neighborhood: string | null;
  paymentMethod: PaymentMethod;
  totalCents: number;
  /** Transições válidas agora (sem `cancelled`, que fica no detalhe). */
  next: OrderStatus[];
  /** Selo do Estorno no card de Cancelados (CAN-02); null/ausente = sem Estorno. Ticket 12. */
  refund?: { state: OrderRefundView["state"] } | null;
};

export type OrdersList = {
  orders: OrderQueueItem[];
  /** Contagem do dia civil (São Paulo) para "Concluídos hoje (N)". */
  closedToday: { completed: number; cancelled: number };
  /** Instante do servidor: base do "há N min" e do "Atualizado há N s". */
  serverTime: string;
};

export type OrderStatusHistoryEntry = {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  /** null = criado pelo Consumidor/sistema. */
  actor: { name: string; role: "owner" | "operator" } | null;
};

/** Detalhe (PED-07) e base da impressão 80 mm (IMP-01) e do "Avisar no WhatsApp" (P-WPP-1). */
export type OrderDetail = {
  id: string;
  code: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  createdAt: string;
  customer: { name: string; phone: string };
  address: OrderAddressView | null;
  lines: OrderLineView[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  /**
   * Tarifa de serviço do pagamento online (decisão 71): item da Foode, fora do total do lojista;
   * 0 no Pagamento na entrega.
   */
  serviceFeeCents?: number;
  payment: { method: PaymentMethod; changeForCents: number | null };
  note: string | null;
  eta: EtaRange | null;
  next: OrderStatus[];
  cancellable: boolean;
  /**
   * Texto e consequência do diálogo de confirmação do Cancelar (CAN-01, Ticket 12); só quando
   * `cancellable`.
   */
  cancelPreview?: CancellationPreview | null;
  /** Motivo e instante do cancelamento (P-OPE-3); null fora do Cancelado. Ticket 12. */
  cancellation?: OrderCancellationView | null;
  /** Estorno do Pedido cancelado (selo separado do status, CAN-02); null = sem Estorno. */
  refund?: OrderRefundView | null;
  history: OrderStatusHistoryEntry[];
  /** Caminho da página de acompanhamento (o token é derivado no servidor; ver orders.ts do db). */
  trackingPath: string;
};

/** Resultado de transição/cancelamento: o novo estado e o que fazer a seguir no Painel. */
export type OrderTransitionResult = {
  status: OrderStatus;
  next: OrderStatus[];
  /** true quando a transição foi o aceite e a Loja ligou "Imprimir ao aceitar" (P-IMP-1). */
  print: boolean;
};

/** Schema do telefone do Consumidor no detalhe (E.164 sem "+"). */
export const orderCustomerSchema = z.object({ name: z.string(), phone: phoneE164Schema });

export const orderStatusHistoryEntrySchema = z.object({
  from: orderStatusSchema.nullable(),
  to: orderStatusSchema,
  at: z.iso.datetime(),
  actor: z.object({ name: z.string(), role: z.enum(["owner", "operator"]) }).nullable(),
});

export const orderQueueItemSchema = z.object({
  id: z.string().uuid(),
  code: z.number().int().min(1),
  status: orderStatusSchema,
  fulfillment: fulfillmentSchema,
  createdAt: z.iso.datetime(),
  customerName: z.string(),
  neighborhood: z.string().nullable(),
  paymentMethod: paymentMethodSchema,
  totalCents: centsSchema,
  next: z.array(orderStatusSchema),
  refund: z.object({ state: refundStateSchema }).nullable().optional(),
});
