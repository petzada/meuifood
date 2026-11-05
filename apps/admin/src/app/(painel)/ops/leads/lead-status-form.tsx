"use client";

// Troca de status de um lead (Ticket 31): select + salvar, com o retorno da action anunciado.
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from "@foode/shared/lead";
import { useActionState, useId } from "react";

import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function LeadStatusForm({
  action,
  leadId,
  leadName,
  status,
}: {
  action: Action;
  leadId: string;
  leadName: string;
  status: LeadStatus;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const selectId = useId();
  const message = state.errors.status ?? state.message;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="sr-only" htmlFor={selectId}>
        Status do lead {leadName}
      </label>
      <select
        id={selectId}
        name="status"
        defaultValue={status}
        className="min-h-10 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
      >
        {LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {LEAD_STATUS_LABELS[option]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-xl border border-[var(--color-hairline)] px-3 text-sm font-bold text-[var(--color-ink)] hover:border-[var(--color-ink)] disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
      {message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="w-full text-xs text-[var(--color-body)]"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
