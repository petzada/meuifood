"use client";

// Plano da Loja (mensal/anual com vigência) e modo do cartão. Cada formulário salva sozinho.
import { BILLING_CYCLES, CARD_MODES, type CardMode, type StorePlanView } from "@foode/shared/ops";
import { useActionState, useId } from "react";

import { Field } from "../../../../components/form";
import { formatPeriod, utcIsoToZonedInput } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { BILLING_CYCLE_LABEL, CARD_MODE_HINT, CARD_MODE_LABEL } from "../../../../lib/ops-labels";
import { PeriodBadge } from "./badges";
import { ActionNotice, SectionHeading, SelectField } from "./fields";
import { SubmitButton } from "./submit-button";
import { ActionForm } from "../../../../components/action-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function PlanPanel({
  action,
  plan,
  planHistory,
  storeId,
}: {
  action: Action;
  plan: StorePlanView | null;
  planHistory: StorePlanView[];
  storeId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const headingId = useId();
  const now = utcIsoToZonedInput(new Date().toISOString());

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <SectionHeading
        id={headingId}
        description="A faixa é informativa: a cobrança da Mensalidade acontece fora do app. Um Plano novo encerra o anterior no início da vigência."
      >
        Plano
      </SectionHeading>

      {plan ? (
        <p className="text-sm text-[var(--color-body)]">
          Vigente: <strong>{BILLING_CYCLE_LABEL[plan.cycle]}</strong>,{" "}
          {formatPeriod(plan.validFrom, plan.validTo)}.
        </p>
      ) : (
        <p className="text-sm text-[var(--color-body)]">
          <strong>Sem Plano vigente.</strong> A ativação exige um Plano em vigor.
        </p>
      )}

      <ActionForm action={formAction} state={state} noValidate className="space-y-5">
        <input type="hidden" name="storeId" value={storeId} />
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            id="plan-cycle"
            name="cycle"
            label="Ciclo"
            defaultValue={plan?.cycle ?? "monthly"}
            error={state.errors.cycle}
          >
            {BILLING_CYCLES.map((cycle) => (
              <option key={cycle} value={cycle}>
                {BILLING_CYCLE_LABEL[cycle]}
              </option>
            ))}
          </SelectField>
          <Field
            id="plan-valid-from"
            name="validFrom"
            type="datetime-local"
            label="Vale a partir de"
            defaultValue={now}
            hint="Horário de Brasília (America/Sao_Paulo)."
            error={state.errors.validFrom}
          />
        </div>
        <ActionNotice state={state} />
        <SubmitButton variant="secondary" pendingLabel="Salvando...">
          Salvar Plano
        </SubmitButton>
      </ActionForm>

      {planHistory.length > 1 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-[var(--color-ink)]">
            Histórico de Planos ({planHistory.length})
          </summary>
          <ul className="mt-3 grid gap-2">
            {planHistory.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-2 text-[var(--color-body)]"
              >
                <PeriodBadge validFrom={entry.validFrom} validTo={entry.validTo} />
                <span>
                  {BILLING_CYCLE_LABEL[entry.cycle]} ·{" "}
                  {formatPeriod(entry.validFrom, entry.validTo)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function CardModePanel({
  action,
  cardMode,
  storeId,
}: {
  action: Action;
  cardMode: CardMode | null;
  storeId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <SectionHeading
        id={headingId}
        description="Provedor do cartão de crédito desta Loja. Cobranças já feitas não mudam."
      >
        Modo do cartão
      </SectionHeading>
      <ActionForm action={formAction} state={state} noValidate className="space-y-5">
        <input type="hidden" name="storeId" value={storeId} />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Modo do cartão</legend>
          {CARD_MODES.map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer gap-3 rounded-2xl border border-[var(--color-hairline)] p-4 has-[:checked]:border-[var(--color-primary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-primary-soft)]"
            >
              <input
                type="radio"
                name="cardMode"
                value={mode}
                defaultChecked={cardMode === mode}
                className="mt-1 size-4 accent-[var(--color-primary)]"
              />
              <span>
                <span className="block font-bold text-[var(--color-ink)]">
                  {CARD_MODE_LABEL[mode]}
                </span>
                <span className="block text-sm text-[var(--color-body)]">
                  {CARD_MODE_HINT[mode]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {state.errors.cardMode ? (
          <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
            Escolha um modo.
          </p>
        ) : null}
        <ActionNotice state={state} />
        <SubmitButton variant="secondary" pendingLabel="Salvando...">
          Salvar modo do cartão
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
