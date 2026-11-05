"use client";

// Cupons em modal (decisão 74): "Criar Cupom" abre o cadastro em 2 etapas e "Editar" abre as
// mesmas partes em abas, por cima da lista. Ao salvar, o modal fecha e o Toast confirma.
// `?novo=1` / `?cupom=<id>` (endereços antigos `/cupons/novo` e `/cupons/<id>`) abrem o modal na
// chegada e são limpos ao fechar.
import { type CouponTemplate, type CouponView } from "@foode/shared/coupon";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { CadastroModal } from "../../../../components/cadastro-modal";
import { EMPTY_COUPON, couponFormValues } from "../../../../lib/coupon-forms";
import type { FormState } from "../../../../lib/ops-forms";
import { CouponStatusBadge } from "./coupon-table";
import { CouponForm, type CouponFormAction } from "./coupon-form";

export type CouponModal = { kind: "new" } | { kind: "edit"; couponId: string } | null;

const Ctx = createContext<{ open: (modal: Exclude<CouponModal, null>) => void }>({
  open: () => undefined,
});

export function OpenCouponButton({
  children,
  className,
  modal,
  variant = "primary",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  modal: Exclude<CouponModal, null>;
  variant?: "primary" | "secondary" | "link";
  "aria-label"?: string;
}) {
  const { open } = useContext(Ctx);
  const classes =
    variant === "link"
      ? "min-h-9 font-bold text-[var(--color-ink)] underline-offset-4 hover:underline focus-visible:underline"
      : `foode-button foode-button--${variant}`;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => open(modal)}
      className={[classes, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function CouponCadastros({
  children,
  coupons,
  createAction,
  initial,
  templates,
  updateAction,
}: {
  children: ReactNode;
  coupons: CouponView[];
  createAction: CouponFormAction;
  initial: CouponModal;
  templates: readonly CouponTemplate[];
  updateAction: (couponId: string, prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [modal, setModal] = useState<CouponModal>(initial);
  const [dirty, setDirty] = useState(false);
  const open = useCallback((next: Exclude<CouponModal, null>) => {
    setDirty(false);
    setModal(next);
  }, []);
  const ctx = useMemo(() => ({ open }), [open]);
  const close = useCallback(() => {
    setModal(null);
    setDirty(false);
    if (typeof window !== "undefined" && /[?&](novo|cupom)=/u.test(window.location.search)) {
      window.history.replaceState(null, "", "/cupons");
    }
  }, []);

  const editing = modal?.kind === "edit" ? coupons.find((c) => c.id === modal.couponId) : null;
  const editAction = useMemo(
    () => (editing ? updateAction.bind(null, editing.id) : null),
    [editing, updateAction],
  );

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {modal?.kind === "new" ? (
        <CadastroModal
          open
          title="Novo Cupom"
          description="O Consumidor digita o código no checkout; o desconto é recalculado no servidor e nunca vale para a taxa de entrega."
          dirty={dirty}
          onClose={close}
        >
          <CouponForm
            action={createAction}
            initial={EMPTY_COUPON}
            mode="create"
            onDirtyChange={setDirty}
            onDone={close}
            templates={templates}
          />
        </CadastroModal>
      ) : null}
      {editing && editAction ? (
        <CadastroModal
          open
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span className="font-mono tracking-wide">{editing.code}</span>
              <CouponStatusBadge status={editing.status} />
            </span>
          }
          dirty={dirty}
          onClose={close}
        >
          <CouponForm
            action={editAction}
            initial={couponFormValues(editing)}
            mode="edit"
            onDirtyChange={setDirty}
            onDone={close}
            usedCount={editing.usedCount}
          />
        </CadastroModal>
      ) : null}
    </Ctx.Provider>
  );
}
