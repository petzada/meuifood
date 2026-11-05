"use client";

// Diálogo de confirmação do Cancelar (Ticket 12; CAN-01, T-12, decisão 74): sobre o detalhe,
// com o fundo escurecido, foco preso e devolvido a quem abriu, Esc = Voltar. Nomeia o Pedido e
// escreve a consequência financeira que a api calculou (`cancelPreview`): só o Pedido muda,
// Estorno automático de R$ X ou cobrança cancelada. Motivo opcional de uma lista curta e fixa
// (P-OPE-3): cancelar sem motivo continua possível. Mesma UI para Dono e Operador; a regra do
// texto e dos motivos vem do contrato (`@foode/shared/order`), aqui só a apresentação.
import { Button, Radio } from "@foode/ui";
import {
  CANCEL_REASON_LABELS,
  CANCEL_REASONS,
  type CancellationPreview,
  cancellationPreview,
  type CancelReason,
  type OrderDetail,
} from "@foode/shared/order";
import { useId, useState } from "react";

import { OverlayDialog } from "../../../../components/overlay-dialog";

/**
 * Pré-visualização do diálogo: a api devolve `cancelPreview` pronto; sem ele (detalhe antigo em
 * cache), a mesma regra pura do contrato decide a partir do pagamento do Pedido.
 */
export function previewFor(order: OrderDetail): CancellationPreview {
  if (order.cancelPreview) return order.cancelPreview;
  const online = order.payment.method !== "on_delivery";
  return cancellationPreview({
    paymentMethod: order.payment.method,
    paymentStatus: online ? "paid" : "not_required",
    totalCents: order.totalCents,
    serviceFeeCents: order.serviceFeeCents ?? 0,
  });
}

export function CancelOrderDialog({
  busy,
  onClose,
  onConfirm,
  order,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: CancelReason | undefined) => Promise<void>;
  order: OrderDetail;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState<CancelReason | "">("");
  const preview = previewFor(order);

  return (
    <OverlayDialog labelledBy={titleId} onClose={busy ? undefined : onClose} className="max-w-md">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void onConfirm(reason === "" ? undefined : reason);
        }}
      >
        <div className="space-y-2">
          <h2 id={titleId} className="text-xl font-bold tracking-[-0.02em]">
            Cancelar o Pedido #{order.code}?
          </h2>
          <p id={descriptionId} className="font-bold leading-relaxed text-[var(--color-ink)]">
            {preview.text}
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-body)]">
            O Pedido cancelado não volta para a fila.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-[var(--color-ink)]">Motivo (opcional)</legend>
          <Radio
            name="cancel-reason"
            value=""
            checked={reason === ""}
            onChange={() => setReason("")}
          >
            Sem motivo
          </Radio>
          {CANCEL_REASONS.map((option) => (
            <Radio
              key={option}
              name="cancel-reason"
              value={option}
              checked={reason === option}
              onChange={() => setReason(option)}
            >
              {CANCEL_REASON_LABELS[option]}
            </Radio>
          ))}
        </fieldset>

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
            Voltar
          </Button>
          <button
            type="submit"
            disabled={busy}
            aria-describedby={descriptionId}
            className="foode-button border-[var(--color-error)] bg-[var(--color-error)] text-white disabled:opacity-60"
          >
            {busy ? "Cancelando..." : "Cancelar o Pedido"}
          </button>
        </div>
      </form>
    </OverlayDialog>
  );
}
