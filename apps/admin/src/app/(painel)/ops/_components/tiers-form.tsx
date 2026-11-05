"use client";

// Publicar nova tabela de faixas (decisão 61): linhas contíguas a partir de 0, só a última sem
// teto, anual com Pedidos ilimitados. O fim de uma faixa define o início da seguinte.
import type { PlanTier } from "@foode/shared/ops";
import { useActionState, useId, useState } from "react";

import { Field } from "../../../../components/form";
import { centsToInput, utcIsoToZonedInput } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice } from "./fields";
import { SubmitButton } from "./submit-button";
import { ActionForm } from "../../../../components/action-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

type Row = { min: number; max: string; price: string };

function rowsFrom(tiers: readonly PlanTier[]): Row[] {
  return tiers.map((tier) => ({
    min: tier.minOrders,
    max: tier.maxOrders === null ? "" : String(tier.maxOrders),
    price: centsToInput(tier.priceCents),
  }));
}

export function TiersForm({
  action,
  initialAnnualCents,
  initialTiers,
}: {
  action: Action;
  initialAnnualCents: number;
  initialTiers: readonly PlanTier[];
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(initialTiers));
  const tableId = useId();
  const now = utcIsoToZonedInput(new Date().toISOString());

  /** Recalcula os inícios: cada faixa começa no fim da anterior + 1. */
  function recompute(next: Row[]): Row[] {
    let min = 0;
    return next.map((row, index) => {
      const fixed = { ...row, min };
      const max = Number(row.max);
      min = Number.isInteger(max) && row.max !== "" ? max + 1 : min;
      // Só a última fica sem teto; as demais precisam de fim.
      if (index < next.length - 1 && row.max === "") fixed.max = "";
      return fixed;
    });
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      recompute(current.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    );
  }

  function add() {
    setRows((current) => {
      if (current.length >= 10) return current;
      const last = current.at(-1);
      const withEnd =
        last && last.max === ""
          ? [...current.slice(0, -1), { ...last, max: String(last.min + 100) }]
          : current;
      return recompute([...withEnd, { min: 0, max: "", price: "" }]);
    });
  }

  function remove(index: number) {
    setRows((current) =>
      current.length <= 1 ? current : recompute(current.filter((_, i) => i !== index)),
    );
  }

  const tiersError = state.errors.monthlyTiers;

  return (
    <ActionForm action={formAction} state={state} noValidate className="space-y-6">
      <input type="hidden" name="tierCount" value={rows.length} />
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[560px] border-collapse text-sm"
          aria-describedby={tiersError ? `${tableId}-erro` : undefined}
        >
          <caption className="sr-only">Faixas mensais</caption>
          <thead>
            <tr className="border-b border-[var(--color-hairline)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
              <th scope="col" className="py-2 pr-3">
                De (Pedidos)
              </th>
              <th scope="col" className="px-3 py-2">
                Até (Pedidos)
              </th>
              <th scope="col" className="px-3 py-2">
                Mensalidade (R$)
              </th>
              <th scope="col" className="py-2 pl-3">
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const last = index === rows.length - 1;
              const maxError =
                state.errors[`monthlyTiers.${index}.maxOrders`] ??
                state.errors[`monthlyTiers.${index}`];
              const priceError = state.errors[`monthlyTiers.${index}.priceCents`];
              return (
                <tr key={index} className="border-b border-[var(--color-hairline-soft)] align-top">
                  <td className="py-3 pr-3">
                    <input type="hidden" name={`tiers.${index}.minOrders`} value={row.min} />
                    <span className="inline-flex min-h-12 items-center font-bold text-[var(--color-ink)]">
                      {row.min}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <label className="sr-only" htmlFor={`${tableId}-max-${index}`}>
                      Fim da faixa {index + 1}
                    </label>
                    <input
                      id={`${tableId}-max-${index}`}
                      name={`tiers.${index}.maxOrders`}
                      inputMode="numeric"
                      value={row.max}
                      placeholder={last ? "sem teto" : ""}
                      aria-invalid={maxError ? true : undefined}
                      onChange={(event) =>
                        update(index, { max: event.currentTarget.value.replace(/\D/g, "") })
                      }
                      className={`block min-h-12 w-full rounded-xl border bg-transparent px-4 text-base text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)] ${maxError ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
                    />
                    {maxError ? (
                      <p className="mt-1 text-xs font-bold text-[var(--color-error)]">{maxError}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <label className="sr-only" htmlFor={`${tableId}-price-${index}`}>
                      Mensalidade da faixa {index + 1}
                    </label>
                    <input
                      id={`${tableId}-price-${index}`}
                      name={`tiers.${index}.priceCents`}
                      inputMode="numeric"
                      data-money=""
                      value={row.price}
                      placeholder="84,99"
                      aria-invalid={priceError ? true : undefined}
                      onChange={(event) => update(index, { price: event.currentTarget.value })}
                      className={`block min-h-12 w-full rounded-xl border bg-transparent px-4 text-base text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)] ${priceError ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
                    />
                    {priceError ? (
                      <p className="mt-1 text-xs font-bold text-[var(--color-error)]">
                        {priceError}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pl-3">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={rows.length <= 1}
                      className="foode-button foode-button--secondary min-h-11 px-4 py-2 text-sm disabled:opacity-40"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tiersError ? (
        <p
          id={`${tableId}-erro`}
          role="alert"
          className="text-sm font-bold text-[var(--color-error)]"
        >
          {tiersError}
        </p>
      ) : null}
      <button
        type="button"
        onClick={add}
        disabled={rows.length >= 10}
        className="foode-button foode-button--secondary min-h-11 px-4 py-2 text-sm disabled:opacity-40"
      >
        Adicionar faixa
      </button>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="annual-price"
          name="annualPriceCents"
          label="Anual, Pedidos ilimitados (R$ no ano)"
          inputMode="numeric"
          data-money=""
          defaultValue={centsToInput(initialAnnualCents)}
          hint="Ex.: 12 × R$ 84,99 = R$ 1.019,88."
          error={state.errors.annualPriceCents}
        />
        <Field
          id="tiers-valid-from"
          name="validFrom"
          type="datetime-local"
          label="Vale a partir de"
          defaultValue={now}
          hint="Horário de Brasília. A tabela vigente termina neste instante."
          error={state.errors.validFrom}
        />
      </div>
      <ActionNotice state={state} />
      <SubmitButton pendingLabel="Publicando...">Publicar tabela</SubmitButton>
    </ActionForm>
  );
}
