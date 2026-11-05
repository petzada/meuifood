"use client";

// Cupom 80 mm (IMP-01, IMP-02, P-IMP-2): Fulfillment em faixa invertida grande, código, hora,
// Consumidor, itens com escolhas, observação geral, endereço, pagamento, troco, total e rodapé
// fixo. Renderizado num portal direto no <body>; o CSS `@media print` de globals.css esconde o
// Painel e deixa só `#cupom-80mm`. O que está na tela (prévia) é o que sai na impressora.
import { formatBRL } from "@foode/shared/money";
import { type OrderDetail, paymentMethodLabelPt } from "@foode/shared/order";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import {
  formatDateTimeSpShort,
  FULFILLMENT_LABEL,
  isPaidOnline,
  RECEIPT_FOOTER,
} from "../../../../lib/orders-labels";

export const RECEIPT_ID = "cupom-80mm";
export const PRINTING_CLASS = "foode-printing";

export function ReceiptBody({ order, storeName }: { order: OrderDetail; storeName: string }) {
  const paid = isPaidOnline(order.payment.method);
  return (
    <div className="foode-receipt">
      <p className="foode-receipt__band">{FULFILLMENT_LABEL[order.fulfillment].toUpperCase()}</p>
      <p className="foode-receipt__code">Pedido #{order.code}</p>
      <p>{formatDateTimeSpShort(order.createdAt)}</p>
      <p className="foode-receipt__store">{storeName}</p>
      <hr />
      <p>
        <strong>{order.customer.name}</strong>
      </p>
      <p>{order.customer.phone}</p>
      <hr />
      <table className="foode-receipt__items">
        <tbody>
          {order.lines.map((line, index) => (
            <tr key={index}>
              <td className="foode-receipt__qty">{line.quantity}x</td>
              <td>
                <strong>{line.itemName}</strong>
                {line.complements.map((choice, i) => (
                  <span key={`c${i}`} className="foode-receipt__choice">
                    {choice.groupName}: {choice.optionName}
                  </span>
                ))}
                {line.additionals.map((extra, i) => (
                  <span key={`a${i}`} className="foode-receipt__choice">
                    + {extra.name}
                  </span>
                ))}
              </td>
              <td className="foode-receipt__amount">{formatBRL(line.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.note ? (
        <>
          <hr />
          <p>
            <strong>Observação:</strong> {order.note}
          </p>
        </>
      ) : null}
      {order.address ? (
        <>
          <hr />
          <p>
            <strong>Entregar em:</strong> {order.address.street}, {order.address.number}
            {order.address.complement ? ` · ${order.address.complement}` : ""}
          </p>
          <p>{order.address.neighborhood}</p>
          {order.address.reference ? <p>Ref.: {order.address.reference}</p> : null}
        </>
      ) : null}
      <hr />
      <table className="foode-receipt__totals">
        <tbody>
          <tr>
            <td>Itens</td>
            <td className="foode-receipt__amount">{formatBRL(order.subtotalCents)}</td>
          </tr>
          {order.deliveryFeeCents > 0 ? (
            <tr>
              <td>Taxa de entrega</td>
              <td className="foode-receipt__amount">{formatBRL(order.deliveryFeeCents)}</td>
            </tr>
          ) : null}
          {order.discountCents > 0 ? (
            <tr>
              <td>Desconto</td>
              <td className="foode-receipt__amount">−{formatBRL(order.discountCents)}</td>
            </tr>
          ) : null}
          <tr className="foode-receipt__total">
            <td>TOTAL</td>
            <td className="foode-receipt__amount">{formatBRL(order.totalCents)}</td>
          </tr>
        </tbody>
      </table>
      <p className="foode-receipt__payment">
        {paid ? "PAGO ONLINE" : "PAGAR NA ENTREGA"} · {paymentMethodLabelPt(order.payment.method)}
      </p>
      {order.payment.changeForCents !== null ? (
        <p className="foode-receipt__payment">
          Troco para {formatBRL(order.payment.changeForCents)} (levar{" "}
          {formatBRL(order.payment.changeForCents - order.totalCents)})
        </p>
      ) : null}
      <hr />
      <p className="foode-receipt__footer">{RECEIPT_FOOTER}</p>
    </div>
  );
}

/** Monta o cupom no <body>, chama `window.print()` e avisa quando a impressão fechou. */
export function PrintReceipt({
  onDone,
  order,
  storeName,
}: {
  onDone: () => void;
  order: OrderDetail;
  storeName: string;
}) {
  useEffect(() => {
    document.body.classList.add(PRINTING_CLASS);
    const finish = () => onDone();
    window.addEventListener("afterprint", finish);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove(PRINTING_CLASS);
    };
  }, [onDone]);

  return createPortal(
    <div id={RECEIPT_ID} aria-hidden="true">
      <ReceiptBody order={order} storeName={storeName} />
    </div>,
    document.body,
  );
}
