"use server";

// Server actions da fila de Pedidos (Ticket 24b): avançar e cancelar. Validam com o Zod do
// contrato, chamam a RPC pelo binding `API` com `{cookie, ip}` e devolvem um resultado
// serializável para o componente da fila (que atualiza a lista na hora). A api confere
// permissão (`orders.update_status` / `orders.cancel`) e a transição de novo.
import type { AuthErrorCode } from "@foode/shared/auth";
import {
  type CancelOrderResult,
  orderCancelInputSchema,
  orderTransitionInputSchema,
  type OrderTransitionResult,
} from "@foode/shared/order";
import { redirect } from "next/navigation";

import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";

export type OrderActionFailure = {
  ok: false;
  error: AuthErrorCode | "invalid_input";
  message: string;
};

export type OrderActionResult = { ok: true; data: OrderTransitionResult } | OrderActionFailure;

/** Resultado do cancelar (Ticket 12): traz a consequência financeira e o motivo gravado. */
export type CancelActionResult = { ok: true; data: CancelOrderResult } | OrderActionFailure;

const ORDER_MESSAGES: Partial<Record<AuthErrorCode, string>> = {
  conflict: "Este Pedido mudou em outra tela. A fila foi atualizada.",
  invalid_input: "Essa mudança de estado não é permitida.",
  not_found: "Este Pedido não existe mais.",
};

function failure(error: AuthErrorCode): OrderActionFailure {
  if (error === "unauthenticated") redirect("/entrar");
  return { ok: false, error, message: ORDER_MESSAGES[error] ?? RPC_ERROR_MESSAGE[error] };
}

/** Avança o Pedido (PED-03): só transições válidas; `print` manda abrir a impressão (P-IMP-1). */
export async function transitionOrder(input: unknown): Promise<OrderActionResult> {
  const parsed = orderTransitionInputSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const result = await painelRpc((api, caller) => api.ordersTransition(caller, parsed.data));
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}

/**
 * Cancela com motivo opcional e produz a consequência financeira (Ticket 12): só o Pedido,
 * Estorno automático ou cobrança cancelada. Cancelar de novo = `conflict`.
 */
export async function cancelOrder(input: unknown): Promise<CancelActionResult> {
  const parsed = orderCancelInputSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const result = await painelRpc((api, caller) => api.ordersCancel(caller, parsed.data));
  return result.ok ? { ok: true, data: result.data } : failure(result.error);
}
