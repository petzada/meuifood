"use client";

// Formulário do Cupom numa página só (CUP-02): código em maiúsculas com contador, tipo
// segmentado % / R$ (teto opcional no %, P-CUP-1), pedido mínimo, validade por datas, dias da
// semana D S T Q Q S S (P-CUP-3; nenhum = todos), limite de usos e ativo. Modelos só PREENCHEM
// o formulário (CUP-05, nada é ativado sem salvar). Resumo vivo abaixo (CUP-03). Criação valida
// no envio com o botão sempre habilitado; edição só salva com mudança (T-06).
import {
  COUPON_CODE_MAX,
  WEEKDAY_PICKER_ORDER,
  WEEKDAY_SHORT_PT,
  type CouponTemplate,
} from "@foode/shared/coupon";
import { Button, OutlineContainer } from "@foode/ui";
import { useActionState, useEffect, useId, useState, type ChangeEvent } from "react";

import { Field } from "../../../../components/form";
import {
  WEEKDAY_LONG_PT,
  applyTemplate,
  couponSummaryPt,
  discountFromValues,
  type CouponFormValues,
} from "../../../../lib/coupon-forms";
import { centsToInput, parseMoneyToCents } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";

export type CouponFormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function moneyText(cents: number | null): string {
  return cents === null ? "" : centsToInput(cents);
}

/** Texto digitado em R$ → centavos; inválido/vazio vira null (o resumo omite o pedaço). */
function moneyValue(raw: string): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null && cents > 0 ? cents : null;
}

function integerValue(raw: string): number | null {
  const digits = raw.replace(/\D/gu, "");
  return digits ? Number(digits) : null;
}

export function CouponForm({
  action,
  initial,
  mode,
  templates = [],
  usedCount = 0,
}: {
  action: CouponFormAction;
  initial: CouponFormValues;
  mode: "create" | "edit";
  templates?: readonly CouponTemplate[];
  usedCount?: number;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [values, setValues] = useState<CouponFormValues>(initial);
  /** Texto dos campos em R$ (controlados para o modelo preencher). */
  const [money, setMoney] = useState(() => ({
    amount: moneyText(initial.amountCents),
    max: moneyText(initial.maxDiscountCents),
    min: moneyText(initial.minOrderCents),
  }));
  const [savedCount, setSavedCount] = useState(0);
  const { dirty, onChange, ref } = useDirtyForm(savedCount);
  const headingId = useId();
  const summaryId = useId();
  const weekdaysId = useId();
  const kindId = useId();

  useEffect(() => {
    if (state.status === "success") setSavedCount((n) => n + 1);
  }, [state]);

  const patch = (next: Partial<CouponFormValues>) =>
    setValues((current) => ({ ...current, ...next }));
  const { errors } = state;
  const summary = couponSummaryPt({
    discount: discountFromValues(values),
    endsOn: values.endsOn,
    minOrderCents: values.minOrderCents,
    startsOn: values.startsOn,
    usageLimit: values.usageLimit,
    weekdays: values.weekdays,
  });

  function toggleWeekday(day: number, on: boolean) {
    patch({
      weekdays: on
        ? [...values.weekdays.filter((d) => d !== day), day]
        : values.weekdays.filter((d) => d !== day),
    });
  }

  function fillFrom(template: CouponTemplate) {
    setValues((current) => applyTemplate(current, template));
    setMoney({
      amount: moneyText(template.fill.amountCents),
      max: moneyText(template.fill.maxDiscountCents),
      min: moneyText(template.fill.minOrderCents),
    });
    // O formulário mudou por fora de um evento de input: recalcula o "sujo" depois do render.
    setTimeout(onChange, 0);
  }

  return (
    <form ref={ref} action={formAction} noValidate onChange={onChange} className="space-y-8">
      {mode === "create" && templates.length > 0 ? (
        <OutlineContainer as="section" aria-labelledby={`${headingId}-modelos`} className="p-5">
          <SectionHeading
            id={`${headingId}-modelos`}
            description="Um toque preenche os campos abaixo; nada é ativado sem você salvar."
          >
            Modelos
          </SectionHeading>
          <ul className="mt-4 flex flex-wrap gap-2" role="list">
            {templates.map((template) => (
              <li key={template.id}>
                <Button onClick={() => fillFrom(template)} variant="secondary">
                  {template.label}
                </Button>
              </li>
            ))}
          </ul>
        </OutlineContainer>
      ) : null}

      <OutlineContainer as="section" aria-labelledby={headingId} className="space-y-6 p-5 md:p-7">
        <SectionHeading
          id={headingId}
          description="O Consumidor digita o código no checkout; o desconto é recalculado no servidor e nunca vale para a taxa de entrega."
        >
          {mode === "create" ? "Novo Cupom" : "Editar Cupom"}
        </SectionHeading>

        <Field
          id="code"
          name="code"
          label="Código"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={COUPON_CODE_MAX}
          value={values.code}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            patch({
              code: event.currentTarget.value
                .toUpperCase()
                .replace(/[^A-Z0-9_-]/gu, "")
                .slice(0, COUPON_CODE_MAX),
            })
          }
          placeholder="BEMVINDO10"
          hint={`${values.code.length}/${COUPON_CODE_MAX} · letras, números, _ ou -. Único nesta Loja.`}
          error={errors.code}
        />

        <fieldset aria-describedby={errors.kind ? `${kindId}-erro` : undefined}>
          <legend className="text-sm font-bold text-[var(--color-ink)]">Tipo de desconto</legend>
          <div className="mt-2 inline-flex rounded-full border border-[var(--color-hairline)] p-1">
            {(
              [
                ["percent", "Percentual (%)"],
                ["fixed", "Valor fixo (R$)"],
              ] as const
            ).map(([kind, label]) => (
              <label
                key={kind}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold ${
                  values.kind === kind
                    ? "bg-[var(--color-primary-strong)] text-white"
                    : "text-[var(--color-body)]"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  checked={values.kind === kind}
                  onChange={() => patch({ kind })}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          {errors.kind ? (
            <p id={`${kindId}-erro`} className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
              {errors.kind}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          {values.kind === "percent" ? (
            <>
              <Field
                id="percent"
                name="percent"
                label="Desconto (%)"
                inputMode="numeric"
                value={values.percent ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  patch({ percent: integerValue(event.currentTarget.value) })
                }
                placeholder="10"
                hint="De 1 a 100, sobre o subtotal dos itens."
                error={errors.percent}
              />
              <Field
                id="maxDiscountCents"
                name="maxDiscountCents"
                label="Teto do desconto em R$ (opcional)"
                inputMode="decimal"
                value={money.max}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setMoney((m) => ({ ...m, max: event.target.value }));
                  patch({ maxDiscountCents: moneyValue(event.target.value) });
                }}
                placeholder="20,00"
                hint="O desconto nunca passa deste valor."
                error={errors.maxDiscountCents}
              />
            </>
          ) : (
            <Field
              id="amountCents"
              name="amountCents"
              label="Desconto em R$"
              inputMode="decimal"
              value={money.amount}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setMoney((m) => ({ ...m, amount: event.target.value }));
                patch({ amountCents: moneyValue(event.target.value) });
              }}
              placeholder="5,00"
              error={errors.amountCents}
            />
          )}
          <Field
            id="minOrderCents"
            name="minOrderCents"
            label="Pedido mínimo em R$ (opcional)"
            inputMode="decimal"
            value={money.min}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setMoney((m) => ({ ...m, min: event.target.value }));
              patch({ minOrderCents: moneyValue(event.target.value) });
            }}
            placeholder="30,00"
            hint="Sobre o subtotal dos itens, sem a taxa de entrega."
            error={errors.minOrderCents}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="startsOn"
            name="startsOn"
            type="date"
            label="Vale a partir de (opcional)"
            defaultValue={initial.startsOn ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              patch({ startsOn: event.currentTarget.value || null })
            }
            error={errors.startsOn}
          />
          <Field
            id="endsOn"
            name="endsOn"
            type="date"
            label="Vale até (opcional)"
            defaultValue={initial.endsOn ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              patch({ endsOn: event.currentTarget.value || null })
            }
            hint="Vazio = sem validade. Datas no horário de Brasília."
            error={errors.endsOn}
          />
        </div>

        <fieldset aria-describedby={`${weekdaysId}-dica`}>
          <legend className="text-sm font-bold text-[var(--color-ink)]">Dias da semana</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_PICKER_ORDER.map((day) => {
              const on = values.weekdays.includes(day);
              return (
                <label
                  key={day}
                  className={`grid size-11 cursor-pointer place-items-center rounded-full border text-sm font-bold ${
                    on
                      ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white"
                      : "border-[var(--color-hairline)] text-[var(--color-body)]"
                  }`}
                  title={WEEKDAY_LONG_PT[day]}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={day}
                    checked={on}
                    aria-label={WEEKDAY_LONG_PT[day]}
                    onChange={(event) => toggleWeekday(day, event.currentTarget.checked)}
                    className="sr-only"
                  />
                  <span aria-hidden="true">{WEEKDAY_SHORT_PT[day]}</span>
                </label>
              );
            })}
          </div>
          <p id={`${weekdaysId}-dica`} className="mt-1.5 text-sm text-[var(--color-muted)]">
            Nenhum dia marcado = vale todos os dias.
          </p>
          {errors.weekdays ? (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-error)]">{errors.weekdays}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="usageLimit"
            name="usageLimit"
            label="Limite total de usos (opcional)"
            inputMode="numeric"
            value={values.usageLimit ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              patch({ usageLimit: integerValue(event.currentTarget.value) })
            }
            placeholder="100"
            hint={
              mode === "edit" && usedCount > 0
                ? `Já usado ${usedCount} vez${usedCount === 1 ? "" : "es"}; o limite não pode ficar abaixo disso.`
                : "Vazio = sem limite."
            }
            error={errors.usageLimit}
          />
          <label className="flex min-h-12 items-center gap-3 self-end text-sm font-bold text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="active"
              checked={values.active}
              onChange={(event) => patch({ active: event.currentTarget.checked })}
              className="size-5 accent-[var(--color-primary-strong)]"
            />
            Cupom ativo
          </label>
        </div>

        <div
          aria-live="polite"
          className="rounded-2xl border border-[var(--color-primary)] px-4 py-3"
          id={summaryId}
          role="status"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            Resumo
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--color-ink)]">{summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {mode === "create" ? (
            <SubmitButton pendingLabel="Criando...">Criar Cupom</SubmitButton>
          ) : (
            <>
              <SubmitButton variant="secondary" disabled={!dirty}>
                Salvar alterações
              </SubmitButton>
              {!dirty && state.status !== "success" ? (
                <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
              ) : null}
            </>
          )}
          <div className="min-w-0 flex-1">
            <ActionNotice state={dirty && state.status === "success" ? IDLE_FORM : state} />
          </div>
        </div>
      </OutlineContainer>
    </form>
  );
}
