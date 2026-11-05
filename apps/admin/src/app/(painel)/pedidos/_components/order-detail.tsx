"use client";

// Detalhe do Pedido (PED-07): painel lateral no desktop, tela cheia no celular. Itens com
// Complementos/Adicionais, observação geral, Fulfillment e endereço, pagamento e "Troco para",
// telefone, "Avisar no WhatsApp" (P-WPP-1), Imprimir (IMP-01), avançar e Cancelar por último
// (T-12: diálogo que nomeia o Pedido e a consequência financeira, Ticket 12). Pedido cancelado:
// motivo e hora visíveis, selo do Estorno separado do status (CAN-02) e nenhuma ação de avanço.
import { Badge, Button } from "@foode/ui";
import { formatBRL } from "@foode/shared/money";
import { SERVICE_FEE_LABEL_PT } from "@foode/shared/payment";
import {
  advanceActionLabelPt,
  cancelReasonLabel,
  type CancelReason,
  formatEtaPt,
  hasRefundBadge,
  nextAdvanceStatus,
  type OrderDetail,
  type OrderStatus,
  orderStatusLabelPt,
  paymentMethodLabelPt,
} from "@foode/shared/order";
import { useEffect, useId, useRef, useState } from "react";

import { formatWhatsapp } from "../../../../lib/ops-format";
import {
  firstName,
  formatTimeSp,
  FULFILLMENT_LABEL,
  isPaidOnline,
  paymentBadgeLabel,
  REFUND_BADGE,
  whatsappMessageFor,
  whatsappUrl,
} from "../../../../lib/orders-labels";
import { CancelOrderDialog } from "./cancel-order-dialog";

export type LoadDetail = (orderId: string) => Promise<OrderDetail>;

export function OrderDetailPanel({
  busy,
  loadDetail,
  onAdvance,
  onCancel,
  onClose,
  onPrint,
  orderId,
  storeName,
  storefrontOrigin,
  version,
}: {
  busy: boolean;
  loadDetail: LoadDetail;
  onAdvance: (order: OrderDetail, to: OrderStatus) => Promise<void>;
  /** Cancela com motivo opcional (P-OPE-3); resolve quando a fila já respondeu (sucesso ou erro). */
  onCancel: (order: OrderDetail, reason: CancelReason | undefined) => Promise<void>;
  onClose: () => void;
  onPrint: (order: OrderDetail) => void;
  orderId: string;
  storeName: string;
  storefrontOrigin: string;
  /** Muda quando a fila alterou este Pedido: recarrega o detalhe. */
  version: number;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadDetail(orderId)
      .then((detail) => {
        if (!cancelled) setOrder(detail);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, loadDetail, orderId, version]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Com o diálogo de cancelamento aberto, Esc é dele (Voltar), não do painel.
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cancelled = order?.status === "cancelled";
  const to = order && !cancelled ? nextAdvanceStatus(order.fulfillment, order.status) : null;
  const refund = order && hasRefundBadge(order.status, order.refund) ? order.refund : null;
  const paid = order ? isPaidOnline(order.payment.method) : false;
  const whatsapp = order
    ? whatsappUrl(
        order.customer.phone,
        whatsappMessageFor({
          status: order.status,
          fulfillment: order.fulfillment,
          code: order.code,
          customerFirstName: firstName(order.customer.name),
          storeName,
          trackingUrl: `${storefrontOrigin}${order.trackingPath}`,
        }),
      )
    : null;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[var(--color-canvas)] outline-none md:inset-y-0 md:left-auto md:right-0 md:w-[min(100vw,30rem)] md:border-l md:border-[var(--color-hairline)]"
    >
      <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)] px-5 py-4">
        <h2 id={titleId} className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
          {order ? `Pedido #${order.code}` : "Pedido"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-hairline)] text-sm font-bold text-[var(--color-body)] hover:bg-[var(--color-primary-soft)]"
        >
          Fechar
        </button>
      </header>

      {failed ? (
        <div className="space-y-3 px-5 py-6">
          <p role="alert" className="font-bold text-[var(--color-error)]">
            Não foi possível carregar este Pedido.
          </p>
          <Button variant="secondary" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : !order ? (
        <div aria-busy="true" className="space-y-3 px-5 py-6">
          <div className="h-5 w-40 rounded-full bg-[var(--color-hairline-soft)]" />
          <div className="h-5 w-64 rounded-full bg-[var(--color-hairline-soft)]" />
          <div className="h-24 rounded-2xl bg-[var(--color-hairline-soft)]" />
        </div>
      ) : (
        <div className="flex-1 space-y-6 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={cancelled ? "error" : "primary"}>{orderStatusLabelPt(order.status)}</Badge>
            <Badge tone="neutral">{FULFILLMENT_LABEL[order.fulfillment]}</Badge>
            <Badge tone={paid ? "success" : "accent"}>
              {paymentBadgeLabel(order.payment.method)}
            </Badge>
            <span className="ml-auto text-sm text-[var(--color-muted)]">
              Recebido às {formatTimeSp(order.createdAt)}
            </span>
          </div>

          {cancelled ? (
            <section
              aria-label="Cancelamento"
              className="space-y-2 rounded-2xl border border-[var(--color-error)] px-4 py-3"
            >
              <p className="font-bold text-[var(--color-ink)]">
                Pedido cancelado
                {order.cancellation ? ` às ${formatTimeSp(order.cancellation.at)}` : ""}
              </p>
              <p className="text-sm text-[var(--color-body)]">
                Motivo: {cancelReasonLabel(order.cancellation?.reason ?? null) ?? "não informado"}
              </p>
              {refund ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={REFUND_BADGE[refund.state].tone}>
                    <span aria-hidden="true">{REFUND_BADGE[refund.state].symbol} </span>
                    {REFUND_BADGE[refund.state].label}
                  </Badge>
                  <span className="text-[var(--color-body)]">{formatBRL(refund.amountCents)}</span>
                </p>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Consumidor" className="space-y-1">
            <p className="font-bold text-[var(--color-ink)]">{order.customer.name}</p>
            <p className="text-[var(--color-body)]">{formatWhatsapp(order.customer.phone)}</p>
            {whatsapp ? (
              <Button
                variant="secondary"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 min-h-10 px-4 py-2 text-sm"
              >
                Avisar no WhatsApp
              </Button>
            ) : null}
          </section>

          <section aria-label="Itens" className="space-y-3">
            <ul className="divide-y divide-[var(--color-hairline-soft)]">
              {order.lines.map((line, index) => (
                <li key={index} className="flex gap-3 py-3">
                  <span className="w-8 shrink-0 font-bold text-[var(--color-ink)]">
                    {line.quantity}x
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[var(--color-ink)]">{line.itemName}</p>
                    {line.complements.map((choice, i) => (
                      <p key={`c${i}`} className="text-sm text-[var(--color-body)]">
                        {choice.groupName}: {choice.optionName}
                      </p>
                    ))}
                    {line.additionals.map((extra, i) => (
                      <p key={`a${i}`} className="text-sm text-[var(--color-body)]">
                        + {extra.name}
                      </p>
                    ))}
                  </div>
                  <span className="shrink-0 text-[var(--color-ink)]">
                    {formatBRL(line.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
            {order.note ? (
              <p className="rounded-2xl border border-[var(--color-accent)] px-4 py-3 text-sm text-[var(--color-ink)]">
                <strong>Observação:</strong> {order.note}
              </p>
            ) : null}
          </section>

          <section aria-label="Entrega" className="space-y-1 text-[var(--color-body)]">
            <p className="font-bold text-[var(--color-ink)]">
              {FULFILLMENT_LABEL[order.fulfillment]}
              {order.eta ? ` · ${formatEtaPt(order.eta)}` : ""}
            </p>
            {order.address ? (
              <>
                <p>
                  {order.address.street}, {order.address.number}
                  {order.address.complement ? ` · ${order.address.complement}` : ""}
                </p>
                <p>
                  {order.address.neighborhood}
                  {order.address.postalCode ? ` · CEP ${order.address.postalCode}` : ""}
                </p>
                {order.address.reference ? <p>Referência: {order.address.reference}</p> : null}
              </>
            ) : (
              <p>O Consumidor retira na Loja.</p>
            )}
          </section>

          <section aria-label="Pagamento" className="space-y-1">
            <dl className="space-y-1 text-[var(--color-body)]">
              <div className="flex justify-between">
                <dt>Itens</dt>
                <dd>{formatBRL(order.subtotalCents)}</dd>
              </div>
              {order.deliveryFeeCents > 0 ? (
                <div className="flex justify-between">
                  <dt>Taxa de entrega</dt>
                  <dd>{formatBRL(order.deliveryFeeCents)}</dd>
                </div>
              ) : null}
              {order.discountCents > 0 ? (
                <div className="flex justify-between">
                  <dt>Desconto</dt>
                  <dd>−{formatBRL(order.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-lg font-bold text-[var(--color-ink)]">
                <dt>Total</dt>
                <dd>{formatBRL(order.totalCents)}</dd>
              </div>
              {/* Decisão 71: tarifa do pagamento online é da Foode, fora do total da Loja. */}
              {(order.serviceFeeCents ?? 0) > 0 ? (
                <div className="flex justify-between text-sm text-[var(--color-muted)]">
                  <dt>{SERVICE_FEE_LABEL_PT} · Foode</dt>
                  <dd>{formatBRL(order.serviceFeeCents ?? 0)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-sm text-[var(--color-body)]">
              {paymentMethodLabelPt(order.payment.method)} ·{" "}
              {paymentBadgeLabel(order.payment.method)}
            </p>
            {order.payment.changeForCents !== null ? (
              <p className="font-bold text-[var(--color-ink)]">
                Troco para {formatBRL(order.payment.changeForCents)} (levar{" "}
                {formatBRL(order.payment.changeForCents - order.totalCents)})
              </p>
            ) : null}
          </section>

          <section
            aria-label="Ações"
            className="space-y-3 border-t border-[var(--color-hairline-soft)] pt-5"
          >
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" type="button" onClick={() => onPrint(order)}>
                Imprimir
              </Button>
              {to ? (
                <Button type="button" disabled={busy} onClick={() => onAdvance(order, to)}>
                  {busy ? "Aguarde..." : advanceActionLabelPt(to)}
                </Button>
              ) : null}
            </div>
            {order.cancellable && !cancelled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingCancel(true)}
                className="min-h-11 rounded-full border border-[var(--color-error)] px-5 text-sm font-bold text-[var(--color-error)] hover:bg-[#fbeae5] disabled:opacity-60"
              >
                Cancelar Pedido
              </button>
            ) : null}
          </section>

          {confirmingCancel && !cancelled ? (
            <CancelOrderDialog
              busy={busy}
              onClose={() => setConfirmingCancel(false)}
              onConfirm={(reason) => onCancel(order, reason).then(() => setConfirmingCancel(false))}
              order={order}
            />
          ) : null}

          {order.history.length > 0 ? (
            <section aria-label="Histórico" className="text-sm text-[var(--color-muted)]">
              <ul className="space-y-1">
                {order.history.map((entry, index) => (
                  <li key={index}>
                    {formatTimeSp(entry.at)} · {orderStatusLabelPt(entry.to)}
                    {entry.actor ? ` · ${entry.actor.name}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
