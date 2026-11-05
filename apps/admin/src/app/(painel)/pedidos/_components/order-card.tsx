"use client";

// Card do Pedido na fila (PED-02 a PED-04): código grande, tempo decorrido, nome, selos de
// Fulfillment e pagamento (texto + símbolo), total e UM botão de avanço com o destino. Pedido
// novo (Recebido, ainda não aberto): borda primary + selo "Novo". Telefone e endereço só no detalhe.
// Card de Concluídos/Cancelados de hoje: selo do status e, no Cancelado, selo do Estorno separado
// (CAN-02); nunca um X de cancelar no card (T-12) e nenhuma ação de avanço.
import { Badge, Button, OutlineContainer } from "@foode/ui";
import { formatBRL } from "@foode/shared/money";
import {
  advanceActionLabelPt,
  nextAdvanceStatus,
  type OrderQueueItem,
  orderStatusLabelPt,
  queueColumnOf,
} from "@foode/shared/order";

import {
  elapsedMinutes,
  formatElapsed,
  FULFILLMENT_LABEL,
  isPaidOnline,
  LATE_RECEIVED_MINUTES,
  paymentBadgeLabel,
  REFUND_BADGE,
} from "../../../../lib/orders-labels";

export function OrderCard({
  busy,
  isNew,
  nowMs,
  onAdvance,
  onOpen,
  order,
}: {
  busy: boolean;
  isNew: boolean;
  nowMs: number;
  onAdvance: (order: OrderQueueItem, to: NonNullable<ReturnType<typeof nextAdvanceStatus>>) => void;
  onOpen: (order: OrderQueueItem) => void;
  order: OrderQueueItem;
}) {
  const closed = queueColumnOf(order.status) === "closed";
  const to = closed ? null : nextAdvanceStatus(order.fulfillment, order.status);
  // Mesma regra de `hasRefundBadge` (o card só traz o estado, sem o valor).
  const refund = order.status === "cancelled" && order.refund ? order.refund : null;
  const late =
    order.status === "received" && elapsedMinutes(order.createdAt, nowMs) >= LATE_RECEIVED_MINUTES;
  const paid = isPaidOnline(order.paymentMethod);

  return (
    <OutlineContainer
      as="article"
      aria-labelledby={`pedido-${order.id}`}
      className={`p-4 ${isNew ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-soft)]"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              id={`pedido-${order.id}`}
              className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
            >
              #{order.code}
            </span>
            {isNew ? <Badge tone="primary">Novo</Badge> : null}
            {closed ? (
              <Badge tone={order.status === "cancelled" ? "error" : "success"}>
                {orderStatusLabelPt(order.status)}
              </Badge>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[var(--color-ink)]">
            {order.customerName}
          </span>
          <span className="sr-only">Abrir detalhe do Pedido #{order.code}</span>
        </button>
        <time
          dateTime={order.createdAt}
          className={`shrink-0 whitespace-nowrap text-sm font-bold ${
            late
              ? "rounded-full border border-[var(--color-accent)] px-2 py-0.5 text-[#7a5600]"
              : "text-[var(--color-muted)]"
          }`}
        >
          {formatElapsed(order.createdAt, nowMs)}
        </time>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="neutral">
          <span aria-hidden="true">{order.fulfillment === "delivery" ? "▲ " : "■ "}</span>
          {FULFILLMENT_LABEL[order.fulfillment]}
          {order.neighborhood ? ` · ${order.neighborhood}` : ""}
        </Badge>
        <Badge tone={paid ? "success" : "accent"}>
          <span aria-hidden="true">{paid ? "✓ " : "$ "}</span>
          {paymentBadgeLabel(order.paymentMethod)}
        </Badge>
        <span className="ml-auto font-bold text-[var(--color-ink)]">
          {formatBRL(order.totalCents)}
        </span>
      </div>

      {refund ? (
        <p className="mt-3 text-sm">
          <Badge tone={REFUND_BADGE[refund.state].tone}>
            <span aria-hidden="true">{REFUND_BADGE[refund.state].symbol} </span>
            {REFUND_BADGE[refund.state].label}
          </Badge>
        </p>
      ) : null}

      {to ? (
        <Button
          type="button"
          variant={order.status === "received" ? "primary" : "secondary"}
          className="mt-4 w-full"
          disabled={busy}
          onClick={() => onAdvance(order, to)}
        >
          {busy ? "Aguarde..." : advanceActionLabelPt(to)}
        </Button>
      ) : null}
    </OutlineContainer>
  );
}
