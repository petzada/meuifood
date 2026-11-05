"use client";

// Lista de Cupons em tabela (CUP-01): Código · Desconto · Pedido mínimo · Validade · Usos ·
// Status (texto + símbolo, T-03) · ações (editar, ativar/desativar, excluir só sem uso).
// Vazio: "Nenhum Cupom ainda." + "Criar Cupom".
import {
  COUPON_STATUS_LABELS_PT,
  couponDiscountLabelPt,
  type CouponStatus,
  type CouponView,
} from "@foode/shared/coupon";
import { formatBRL } from "@foode/shared/money";
import { useActionState } from "react";

import { validityLabelPt, weekdaysLabelPt } from "../../../../lib/coupon-forms";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice, EmptyState } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { OpenCouponButton } from "./coupon-cadastros";
import type { CouponFormAction } from "./coupon-form";

const STATUS_GLYPH: Record<CouponStatus, string> = {
  active: "●",
  inactive: "○",
  expired: "■",
  exhausted: "■",
  scheduled: "◔",
};

const STATUS_CLASSES: Record<CouponStatus, string> = {
  active: "border-[#2e7d32] text-[#1f5f23]",
  inactive: "border-[var(--color-hairline)] text-[var(--color-muted)]",
  expired: "border-[var(--color-hairline)] text-[var(--color-muted)]",
  exhausted: "border-[var(--color-error)] text-[var(--color-error)]",
  scheduled: "border-[var(--color-accent)] text-[#7a5600]",
};

export function CouponStatusBadge({ status }: { status: CouponStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {COUPON_STATUS_LABELS_PT[status]}
    </span>
  );
}

function RowActions({
  coupon,
  onDelete,
  onSetActive,
}: {
  coupon: CouponView;
  onDelete: CouponFormAction;
  onSetActive: CouponFormAction;
}) {
  const [activeState, setActiveAction] = useActionState(onSetActive, IDLE_FORM);
  const [deleteState, deleteAction] = useActionState(onDelete, IDLE_FORM);
  const nextActive = !coupon.active;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <OpenCouponButton
        modal={{ kind: "edit", couponId: coupon.id }}
        variant="link"
        aria-label={`Editar ${coupon.code}`}
      >
        Editar
      </OpenCouponButton>
      <form action={setActiveAction}>
        <input type="hidden" name="couponId" value={coupon.id} />
        <input type="hidden" name="active" value={String(nextActive)} />
        <SubmitButton className="min-h-9 px-3 text-sm" pendingLabel="..." variant="secondary">
          {nextActive ? `Ativar ${coupon.code}` : `Desativar ${coupon.code}`}
        </SubmitButton>
      </form>
      {coupon.usedCount === 0 ? (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm(`Excluir o Cupom ${coupon.code}? Ele ainda não foi usado.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="couponId" value={coupon.id} />
          <SubmitButton className="min-h-9 px-3 text-sm" pendingLabel="..." variant="secondary">
            {`Excluir ${coupon.code}`}
          </SubmitButton>
        </form>
      ) : null}
      {activeState.status === "error" ? <ActionNotice state={activeState} /> : null}
      {deleteState.status === "error" ? <ActionNotice state={deleteState} /> : null}
    </div>
  );
}

export function CouponTable({
  coupons,
  onDelete,
  onSetActive,
}: {
  coupons: CouponView[];
  onDelete: CouponFormAction;
  onSetActive: CouponFormAction;
}) {
  if (coupons.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="Nenhum Cupom ainda. Crie um código para divulgar.">
          <p className="mt-3">
            <OpenCouponButton modal={{ kind: "new" }}>Criar Cupom</OpenCouponButton>
          </p>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <caption className="sr-only">Cupons promocionais desta Loja</caption>
        <thead>
          <tr className="border-b border-[var(--color-hairline)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            <th scope="col" className="px-5 py-3">
              Código
            </th>
            <th scope="col" className="px-4 py-3">
              Desconto
            </th>
            <th scope="col" className="px-4 py-3">
              Pedido mínimo
            </th>
            <th scope="col" className="px-4 py-3">
              Validade
            </th>
            <th scope="col" className="px-4 py-3">
              Usos
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon) => (
            <tr
              key={coupon.id}
              className="border-b border-[var(--color-hairline-soft)] last:border-b-0 hover:bg-[var(--color-primary-soft)]/40"
            >
              <th scope="row" className="px-5 py-4 text-left font-bold text-[var(--color-ink)]">
                <span className="font-mono tracking-wide">{coupon.code}</span>
                {coupon.weekdays.length > 0 ? (
                  <span className="block text-xs font-normal text-[var(--color-muted)]">
                    {weekdaysLabelPt(coupon.weekdays)}
                  </span>
                ) : null}
              </th>
              <td className="px-4 py-4 text-[var(--color-ink)]">
                {couponDiscountLabelPt(coupon.discount)}
              </td>
              <td className="px-4 py-4 text-[var(--color-body)]">
                {coupon.minOrderCents ? formatBRL(coupon.minOrderCents) : "—"}
              </td>
              <td className="px-4 py-4 text-[var(--color-body)]">
                {validityLabelPt(coupon.startsOn, coupon.endsOn)}
              </td>
              <td className="px-4 py-4 tabular-nums text-[var(--color-body)]">
                {coupon.usageLimit === null
                  ? `${coupon.usedCount}`
                  : `${coupon.usedCount} de ${coupon.usageLimit}`}
              </td>
              <td className="px-4 py-4">
                <CouponStatusBadge status={coupon.status} />
              </td>
              <td className="px-4 py-4">
                <RowActions coupon={coupon} onDelete={onDelete} onSetActive={onSetActive} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
