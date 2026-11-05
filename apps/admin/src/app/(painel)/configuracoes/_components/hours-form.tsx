"use client";

// Horários (CFG-01, decisão 58): grade Seg–Dom com períodos HH:MM, "+ período" (até 4 por dia),
// "Copiar para todos os dias", erro inline por período (início ≥ fim, sobreposição) já no
// navegador com o validador do contrato e de novo no servidor. Sem campo de fuso: legenda
// "Horário de Brasília". Edição (T-06): salva só com mudança.
import {
  MAX_PERIODS_PER_DAY,
  type OpeningPeriod,
  sortOpeningPeriods,
  validateOpeningPeriods,
  WEEKDAY_LABELS_PT,
  WEEKDAYS,
  type Weekday,
} from "@foode/shared/order";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { periodErrors } from "../../../../lib/settings-forms";
import { ActionNotice, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { ActionForm } from "../../../../components/action-form";

type Row = { key: number; weekday: Weekday; opensAt: string; closesAt: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

let rowSeq = 0;
const row = (weekday: Weekday, opensAt = "", closesAt = ""): Row => ({
  key: ++rowSeq,
  weekday,
  opensAt,
  closesAt,
});

function serialize(rows: Row[]): string {
  return rows.map((r) => `${r.weekday}|${r.opensAt}|${r.closesAt}`).join(";");
}

const INPUT =
  "min-h-11 rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]";

/** Erros do navegador por índice da linha (mesmo validador do contrato). */
function localErrors(rows: Row[]): Map<number, string> {
  const errors = new Map<number, string>();
  const periods: OpeningPeriod[] = rows.map((r) => ({
    weekday: r.weekday,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
  }));
  const result = validateOpeningPeriods(periods);
  if (result.ok) return errors;
  const message =
    result.error.code === "overlap"
      ? "Este período se sobrepõe a outro do mesmo dia."
      : result.error.code === "too_many_periods"
        ? `No máximo ${MAX_PERIODS_PER_DAY} períodos por dia.`
        : "O início precisa ser antes do fim (HH:MM).";
  errors.set(result.error.index, message);
  return errors;
}

export function HoursForm({ action, initial }: { action: Action; initial: OpeningPeriod[] }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [rows, setRows] = useState<Row[]>(() =>
    sortOpeningPeriods(initial).map((p) => row(p.weekday as Weekday, p.opensAt, p.closesAt)),
  );
  const [baseline, setBaseline] = useState(() => serialize(rows));
  const [showErrors, setShowErrors] = useState(false);
  const submitted = useRef(baseline);
  const headingId = useId();

  // Depois de salvar, a foto enviada vira a nova base (T-06).
  useEffect(() => {
    if (state.status === "success") setBaseline(submitted.current);
  }, [state]);

  const dirty = serialize(rows) !== baseline;
  const errors = showErrors ? localErrors(rows) : new Map<number, string>();
  const serverErrors = periodErrors(state.errors);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((list) => list.filter((r) => r.key !== key));
  const add = (weekday: Weekday) => setRows((list) => [...list, row(weekday)]);
  const copyToAll = (weekday: Weekday) =>
    setRows((list) => {
      const source = list.filter((r) => r.weekday === weekday);
      return WEEKDAYS.flatMap((day) =>
        day === weekday ? source : source.map((r) => row(day, r.opensAt, r.closesAt)),
      );
    });

  return (
    <ActionForm
      action={formAction}
      state={state}
      noValidate
      onSubmit={(event) => {
        setShowErrors(true);
        if (localErrors(rows).size > 0) event.preventDefault();
        else submitted.current = serialize(rows);
      }}
      className="space-y-5"
    >
      <SectionHeading
        id={headingId}
        description="Horário de Brasília. Fora destes períodos a Loja aparece fechada e o checkout fica bloqueado."
      >
        Horários de funcionamento
      </SectionHeading>
      <input type="hidden" name="periodCount" value={rows.length} />
      <ul className="divide-y divide-[var(--color-hairline-soft)]">
        {WEEKDAYS.map((day) => {
          const dayRows = rows.filter((r) => r.weekday === day);
          return (
            <li key={day} className="grid gap-3 py-4 sm:grid-cols-[7rem_1fr]">
              <p className="pt-2 font-bold text-[var(--color-ink)]">{WEEKDAY_LABELS_PT[day]}</p>
              <div className="space-y-2">
                {dayRows.length === 0 ? (
                  <p className="pt-2 text-sm text-[var(--color-muted)]">Fechada</p>
                ) : null}
                {dayRows.map((r) => {
                  const index = rows.indexOf(r);
                  const error = errors.get(index) ?? serverErrors.get(index);
                  const errorId = `periodo-${r.key}-erro`;
                  return (
                    <div key={r.key}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name={`periods.${index}.weekday`} value={r.weekday} />
                        <label className="sr-only" htmlFor={`periodo-${r.key}-inicio`}>
                          {WEEKDAY_LABELS_PT[day]}, início do período
                        </label>
                        <input
                          id={`periodo-${r.key}-inicio`}
                          name={`periods.${index}.opensAt`}
                          type="time"
                          required
                          value={r.opensAt}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => update(r.key, { opensAt: event.target.value })}
                          className={INPUT}
                        />
                        <span aria-hidden="true" className="text-[var(--color-muted)]">
                          às
                        </span>
                        <label className="sr-only" htmlFor={`periodo-${r.key}-fim`}>
                          {WEEKDAY_LABELS_PT[day]}, fim do período
                        </label>
                        <input
                          id={`periodo-${r.key}-fim`}
                          name={`periods.${index}.closesAt`}
                          type="time"
                          required
                          value={r.closesAt}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => update(r.key, { closesAt: event.target.value })}
                          className={INPUT}
                        />
                        <button
                          type="button"
                          onClick={() => remove(r.key)}
                          className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--color-body)] underline-offset-4 hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                      {error ? (
                        <p
                          id={errorId}
                          className="mt-1 text-sm font-bold text-[var(--color-error)]"
                        >
                          {error}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  {dayRows.length < MAX_PERIODS_PER_DAY ? (
                    <button
                      type="button"
                      onClick={() => add(day)}
                      className="min-h-11 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)] hover:bg-[var(--color-primary-soft)]"
                    >
                      + Período
                    </button>
                  ) : null}
                  {dayRows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => copyToAll(day)}
                      className="min-h-11 rounded-full px-4 text-sm font-bold text-[var(--color-body)] underline-offset-4 hover:underline"
                    >
                      Copiar {WEEKDAY_LABELS_PT[day]} para todos os dias
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ActionNotice state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={!dirty} pendingLabel="Salvando...">
          Salvar alterações
        </SubmitButton>
        {!dirty ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
        ) : null}
      </div>
    </ActionForm>
  );
}
