"use client";

import { OutlineContainer } from "@foode/ui";
import { useState } from "react";

import { SubmitButton } from "../team/submit-button";
import { saveOperatingHours, setPause } from "./actions";

export type OperatingPeriod = {
  closesAt: string;
  opensAt: string;
  weekday: number;
};

export type StoreOperationConfig = {
  paused: boolean;
  periods: OperatingPeriod[];
};

export type OperationFeedback =
  | "horarios-erro"
  | "horarios-salvos"
  | "pausa-ativada"
  | "pausa-desativada"
  | "pausa-erro";

export const operationFeedbackMessages: Record<OperationFeedback, string> = {
  "horarios-erro":
    "Não foi possível salvar. Confira horários, ordem e sobreposições.",
  "horarios-salvos": "Horários de funcionamento salvos.",
  "pausa-ativada": "Pausa ativada. O checkout foi bloqueado.",
  "pausa-desativada": "Pausa desativada.",
  "pausa-erro": "Não foi possível alterar a Pausa.",
};

const weekdays = [
  { label: "Segunda-feira", value: 1 },
  { label: "Terça-feira", value: 2 },
  { label: "Quarta-feira", value: 3 },
  { label: "Quinta-feira", value: 4 },
  { label: "Sexta-feira", value: 5 },
  { label: "Sábado", value: 6 },
  { label: "Domingo", value: 7 },
] as const;

export function OperationPanel({
  feedback,
  operation,
}: {
  feedback?: OperationFeedback | undefined;
  operation: StoreOperationConfig;
}) {
  const [periods, setPeriods] = useState<OperatingPeriod[]>(operation.periods);

  function updatePeriod(
    index: number,
    field: "closesAt" | "opensAt",
    value: string,
  ) {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period,
      ),
    );
  }

  return (
    <section
      id="funcionamento"
      className="mx-auto mt-12 max-w-5xl scroll-mt-8"
    >
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
        Funcionamento
      </h2>
      <p className="mt-2 max-w-[62ch] text-[var(--color-body)]">
        Defina períodos no horário de São Paulo. Deixe um dia sem períodos para
        marcá-lo como fechado.
      </p>

      {feedback ? (
        <p
          role={feedback.endsWith("erro") ? "alert" : "status"}
          className="mt-5 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-sm font-bold text-[var(--color-body)]"
        >
          {operationFeedbackMessages[feedback]}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
        <OutlineContainer className="p-5 md:p-6">
          <form action={saveOperatingHours}>
            <input
              name="schedule"
              type="hidden"
              value={JSON.stringify(periods)}
            />
            <div className="grid gap-5">
              {weekdays.map((day) => {
                const dayPeriods = periods
                  .map((period, index) => ({ index, period }))
                  .filter(({ period }) => period.weekday === day.value);
                return (
                  <fieldset
                    className="rounded-2xl border border-[var(--color-hairline-soft)] p-4"
                    key={day.value}
                  >
                    <legend className="px-2 font-bold text-[var(--color-ink)]">
                      {day.label}
                    </legend>
                    {dayPeriods.length === 0 ? (
                      <p className="text-sm text-[var(--color-muted)]">
                        Dia fechado
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {dayPeriods.map(({ index, period }) => (
                          <div
                            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                            key={`${day.value}-${index}`}
                          >
                            <label className="text-sm font-bold text-[var(--color-ink)]">
                              Abre
                              <input
                                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-3 font-normal outline-none focus:border-[var(--color-primary)]"
                                onChange={(event) =>
                                  updatePeriod(
                                    index,
                                    "opensAt",
                                    event.currentTarget.value,
                                  )
                                }
                                required
                                type="time"
                                value={period.opensAt}
                              />
                            </label>
                            <label className="text-sm font-bold text-[var(--color-ink)]">
                              Fecha
                              <input
                                className="mt-1 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-3 font-normal outline-none focus:border-[var(--color-primary)]"
                                onChange={(event) =>
                                  updatePeriod(
                                    index,
                                    "closesAt",
                                    event.currentTarget.value,
                                  )
                                }
                                required
                                type="time"
                                value={period.closesAt}
                              />
                            </label>
                            <button
                              className="min-h-11 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)]"
                              onClick={() =>
                                setPeriods((current) =>
                                  current.filter(
                                    (_, periodIndex) => periodIndex !== index,
                                  ),
                                )
                              }
                              type="button"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      className="mt-3 min-h-10 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-primary-active)]"
                      onClick={() =>
                        setPeriods((current) => [
                          ...current,
                          {
                            closesAt: "18:00",
                            opensAt: "09:00",
                            weekday: day.value,
                          },
                        ])
                      }
                      type="button"
                    >
                      Adicionar período
                    </button>
                  </fieldset>
                );
              })}
            </div>
            <SubmitButton className="mt-5 w-full sm:w-auto">
              Salvar horários
            </SubmitButton>
          </form>
        </OutlineContainer>

        <OutlineContainer className="h-fit p-5 md:p-6">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">
            Efeito imediato
          </p>
          <h3 className="mt-2 text-lg font-bold text-[var(--color-ink)]">
            {operation.paused ? "Loja em Pausa" : "Loja sem Pausa"}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
            A Pausa bloqueia o checkout sem apagar ou alterar os horários
            salvos.
          </p>
          <form action={setPause} className="mt-5">
            <input
              name="paused"
              type="hidden"
              value={String(!operation.paused)}
            />
            <SubmitButton className="w-full">
              {operation.paused ? "Retomar checkout" : "Ativar Pausa"}
            </SubmitButton>
          </form>
        </OutlineContainer>
      </div>
    </section>
  );
}
