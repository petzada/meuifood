"use client";

// Convite e reenvio do Dono (`opsInviteOwner`): Turnstile + rate limit na api. Reenviar é
// convidar o mesmo e-mail de novo (usuário existente só recebe o aviso).
import type { StoreOwnerView } from "@foode/shared/ops";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Field } from "../../../../components/form";
import { Turnstile, type TurnstileHandle } from "../../../../components/turnstile";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, EmptyState, SectionHeading } from "./fields";
import { SubmitButton } from "./submit-button";
import { ActionForm } from "../../../../components/action-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function OwnerInviteForm({
  action,
  owners,
  siteKey,
  storeId,
}: {
  action: Action;
  owners: StoreOwnerView[];
  siteKey: string;
  storeId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [token, setToken] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ email: string; name: string } | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const headingId = useId();
  const emailRef = useRef<HTMLInputElement>(null);

  // Cada token vale uma verificação: depois de qualquer resposta, pede outro.
  useEffect(() => {
    if (state.status !== "idle") turnstile.current?.reset();
  }, [state]);

  function resend(owner: StoreOwnerView) {
    setPrefill({ email: owner.email, name: owner.name });
    emailRef.current?.focus();
  }

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <SectionHeading
        id={headingId}
        description="O Dono recebe por e-mail um link para definir a senha e entrar no Painel da Loja."
      >
        Dono
      </SectionHeading>

      {owners.length === 0 ? (
        <EmptyState title="Nenhum Dono convidado.">
          <p>Convide pelo formulário abaixo; o convite conta para a ativação.</p>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {owners.map((owner) => (
            <li
              key={owner.membershipId}
              className="grid gap-3 rounded-2xl border border-[var(--color-hairline-soft)] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-[var(--color-ink)]">
                  {owner.name || owner.email}
                </p>
                <p className="truncate text-sm text-[var(--color-muted)]">{owner.email}</p>
                <p className="mt-1 text-sm">
                  {owner.accepted ? (
                    <span className="font-bold text-[#1f5f23]">Convite aceito</span>
                  ) : (
                    <span className="font-bold text-[#7a5600]">
                      Aguardando o Dono definir a senha
                    </span>
                  )}
                </p>
              </div>
              {!owner.accepted ? (
                <button
                  type="button"
                  onClick={() => resend(owner)}
                  className="foode-button foode-button--secondary min-h-11 px-4 py-2 text-sm"
                >
                  Reenviar convite
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ActionForm
        action={formAction}
        state={state}
        noValidate
        className="space-y-5"
        key={prefill?.email ?? "novo"}
      >
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="turnstileToken" value={token ?? ""} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            ref={emailRef}
            id="owner-email"
            name="email"
            type="email"
            label="E-mail do Dono"
            inputMode="email"
            autoComplete="off"
            defaultValue={prefill?.email ?? ""}
            error={state.errors.email}
          />
          <Field
            id="owner-name"
            name="name"
            label="Nome (opcional)"
            autoComplete="off"
            maxLength={120}
            defaultValue={prefill?.name ?? ""}
            error={state.errors.name}
          />
        </div>
        <Turnstile ref={turnstile} siteKey={siteKey} onToken={setToken} />
        <ActionNotice state={state} />
        <SubmitButton variant="secondary" pendingLabel="Enviando...">
          {prefill ? "Reenviar convite" : "Convidar Dono"}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
