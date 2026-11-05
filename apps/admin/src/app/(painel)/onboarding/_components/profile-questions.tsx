"use client";

// Duas perguntas de perfil no primeiro acesso do Dono (P-ONB-4, decisão 63): culinária e
// objetivo com opções fechadas e "Outro" (texto). A tela diz que as respostas são dado
// interno da Foode. Respondidas uma vez, não reaparecem (`profileAnswered`).
import {
  PROFILE_OTHER_MAX,
  STORE_CUISINE_LABELS,
  STORE_CUISINES,
  STORE_GOAL_LABELS,
  STORE_GOALS,
} from "@foode/shared/onboarding";
import { OutlineContainer } from "@foode/ui";
import { useActionState, useState } from "react";

import { Field } from "../../../../components/form";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Question({
  error,
  labels,
  legend,
  name,
  onChange,
  onOtherChange,
  options,
  other,
  otherError,
  otherLabel,
  value,
}: {
  error?: string | undefined;
  labels: Readonly<Record<string, string>>;
  legend: string;
  name: string;
  onChange: (value: string) => void;
  onOtherChange: (value: string) => void;
  options: readonly string[];
  other: string;
  otherError?: string | undefined;
  otherLabel: string;
  value: string;
}) {
  const errorId = `${name}-erro`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-lg font-bold text-[var(--color-ink)]">{legend}</legend>
      {/* Valor em campo oculto controlado: o reset do formulário depois da action não o apaga. */}
      <input type="hidden" name={name} value={value} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-base text-[var(--color-ink)] transition-colors has-[:checked]:border-[var(--color-primary)] has-[:checked]:ring-2 has-[:checked]:ring-[var(--color-primary-soft)] ${
              error ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"
            }`}
          >
            <input
              checked={value === option}
              className="size-4 accent-[var(--color-primary)]"
              name={`${name}Choice`}
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            {labels[option]}
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
      {value === "other" ? (
        <div className="mt-3">
          <Field
            id={`${name}Other`}
            name={`${name}Other`}
            label={otherLabel}
            maxLength={PROFILE_OTHER_MAX}
            autoComplete="off"
            error={otherError}
            onChange={(event) => onOtherChange(event.currentTarget.value)}
            value={other}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

export function ProfileQuestions({ action, storeName }: { action: Action; storeName: string }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [cuisine, setCuisine] = useState("");
  const [cuisineOther, setCuisineOther] = useState("");
  const [goal, setGoal] = useState("");
  const [goalOther, setGoalOther] = useState("");

  return (
    <OutlineContainer
      as="section"
      aria-labelledby="perfil-title"
      className="mx-auto max-w-3xl p-5 md:p-7"
    >
      <p className="text-sm font-bold text-[var(--color-primary-strong)]">{storeName}</p>
      <h1
        id="perfil-title"
        className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]"
      >
        Antes de começar, duas perguntas
      </h1>
      <p className="mt-2 max-w-[64ch] text-[var(--color-body)]">
        Suas respostas são <strong>para uso interno da Foode</strong>: ajudam a equipe a conhecer
        sua Loja. Não aparecem para o cliente nem no Cardápio.
      </p>
      <form action={formAction} noValidate className="mt-6 space-y-8">
        <Question
          error={state.errors["cuisine.value"] ?? state.errors.cuisine}
          labels={STORE_CUISINE_LABELS}
          legend="Qual é o tipo de cozinha da sua Loja?"
          name="cuisine"
          onChange={setCuisine}
          onOtherChange={setCuisineOther}
          options={STORE_CUISINES}
          other={cuisineOther}
          otherError={state.errors["cuisine.other"]}
          otherLabel="Qual?"
          value={cuisine}
        />
        <Question
          error={state.errors["goal.value"] ?? state.errors.goal}
          labels={STORE_GOAL_LABELS}
          legend="O que você mais quer com a Foode?"
          name="goal"
          onChange={setGoal}
          onOtherChange={setGoalOther}
          options={STORE_GOALS}
          other={goalOther}
          otherError={state.errors["goal.other"]}
          otherLabel="Conte para a gente"
          value={goal}
        />
        <div className="space-y-4 border-t border-[var(--color-hairline-soft)] pt-6">
          <ActionNotice state={state} />
          <SubmitButton pendingLabel="Enviando...">Continuar</SubmitButton>
        </div>
      </form>
    </OutlineContainer>
  );
}
