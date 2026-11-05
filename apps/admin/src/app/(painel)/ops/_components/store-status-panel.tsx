"use client";

// Estado da Loja: ativar (mostra o que falta, ACTIVATION_REQUIRED_CHECKS) e suspender com
// motivo e confirmação que nomeia a consequência (OPS-04, T-12).
import { Button } from "@foode/ui";
import type { StoreStatus } from "@foode/shared/auth";
import {
  ACTIVATION_REQUIRED_CHECKS,
  canTransitionStore,
  type OnboardingChecklist,
} from "@foode/shared/ops";
import { useActionState, useEffect, useId, useRef } from "react";

import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ONBOARDING_CHECK_LABEL, STORE_STATUS_LABEL } from "../../../../lib/ops-labels";
import { CheckMark, StoreStatusBadge } from "./badges";
import { ActionNotice, SectionHeading, TextareaField } from "./fields";
import { SubmitButton } from "./submit-button";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function StoreStatusPanel({
  activate,
  onboarding,
  status,
  storeId,
  storeName,
  suspend,
}: {
  activate: Action;
  onboarding: OnboardingChecklist;
  status: StoreStatus;
  storeId: string;
  storeName: string;
  suspend: Action;
}) {
  const [activateState, activateAction] = useActionState(activate, IDLE_FORM);
  const [suspendState, suspendAction] = useActionState(suspend, IDLE_FORM);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const dialogTitleId = useId();

  const missing = ACTIVATION_REQUIRED_CHECKS.filter(
    (check) => !onboarding.find((item) => item.check === check)?.done,
  );
  const canActivate = canTransitionStore(status, "active");
  const canSuspend = canTransitionStore(status, "suspended");
  const done = onboarding.filter((item) => item.done).length;

  useEffect(() => {
    if (suspendState.status === "success") dialog.current?.close();
  }, [suspendState]);

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading id={headingId}>Estado da Loja</SectionHeading>
        <StoreStatusBadge status={status} />
      </div>

      <div>
        <p className="text-sm font-bold text-[var(--color-ink)]">
          Checklist de onboarding · {done} de {onboarding.length}
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {onboarding.map((item) => {
            const required = (ACTIVATION_REQUIRED_CHECKS as readonly string[]).includes(item.check);
            return (
              <li key={item.check} className="flex items-center gap-2 text-sm">
                <CheckMark done={item.done} />
                <span
                  className={item.done ? "text-[var(--color-body)]" : "text-[var(--color-ink)]"}
                >
                  {ONBOARDING_CHECK_LABEL[item.check]}
                  {!item.done && required ? (
                    <span className="text-[var(--color-muted)]"> · exigido para ativar</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {canActivate ? (
        <form action={activateAction} className="space-y-3">
          <input type="hidden" name="storeId" value={storeId} />
          {missing.length > 0 ? (
            <p role="status" className="text-sm text-[var(--color-body)]">
              Para ativar, falta:{" "}
              <strong>{missing.map((check) => ONBOARDING_CHECK_LABEL[check]).join(", ")}</strong>.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-body)]">
              Tudo pronto. Ao ativar, a Loja passa a aceitar Pedidos no Canal próprio.
            </p>
          )}
          <ActionNotice state={activateState} />
          <SubmitButton disabled={missing.length > 0} pendingLabel="Ativando...">
            {status === "suspended" ? "Reativar Loja" : "Ativar Loja"}
          </SubmitButton>
        </form>
      ) : null}

      {canSuspend ? (
        <div className="space-y-3 border-t border-[var(--color-hairline-soft)] pt-5">
          <p className="text-sm text-[var(--color-body)]">
            Suspender tira a Loja do ar: o Storefront para de aceitar Pedidos até a reativação.
          </p>
          <ActionNotice state={suspendState} />
          <Button variant="secondary" onClick={() => dialog.current?.showModal()}>
            Suspender Loja
          </Button>
          <dialog
            ref={dialog}
            aria-labelledby={dialogTitleId}
            className="w-[min(92vw,32rem)] rounded-3xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0 text-[var(--color-ink)] backdrop:bg-black/40"
          >
            <form action={suspendAction} className="space-y-5 p-6">
              <input type="hidden" name="storeId" value={storeId} />
              <h3 id={dialogTitleId} className="text-xl font-bold tracking-[-0.02em]">
                Suspender {storeName}?
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-body)]">
                A Loja sai do estado <strong>{STORE_STATUS_LABEL[status]}</strong> para{" "}
                <strong>{STORE_STATUS_LABEL.suspended}</strong> agora. Pedidos em andamento
                continuam; novos Pedidos ficam bloqueados até o Ops reativar. O motivo fica na
                auditoria.
              </p>
              <TextareaField
                id="suspend-reason"
                name="reason"
                label="Motivo"
                required
                minLength={3}
                maxLength={500}
                error={suspendState.errors.reason}
                hint="De 3 a 500 caracteres."
              />
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="secondary" type="button" onClick={() => dialog.current?.close()}>
                  Voltar
                </Button>
                <SubmitButton pendingLabel="Suspendendo...">Confirmar suspensão</SubmitButton>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </section>
  );
}
