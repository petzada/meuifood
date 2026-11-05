"use client";

// Cupom de boas-vindas (CUP-04, decisão 66): seção própria no topo de `/cupons` com o
// interruptor do programa, o desconto (% com teto ou R$), pedido mínimo opcional e o texto vivo
// do que o Consumidor recebe. Primeira compra por Loja, uma vez por conta; Pedidos Guest
// vinculados pelo telefone contam e bloqueiam.
import type { WelcomeCouponView } from "@foode/shared/coupon";
import { OutlineContainer } from "@foode/ui";
import { useActionState, useEffect, useId, useState, type ChangeEvent } from "react";

import { Field } from "../../../../components/form";
import { welcomeSummaryPt } from "../../../../lib/coupon-forms";
import { centsToInput, parseMoneyToCents } from "../../../../lib/ops-format";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import type { CouponFormAction } from "./coupon-form";
import { ActionForm } from "../../../../components/action-form";

function moneyValue(raw: string): number | null {
  const cents = parseMoneyToCents(raw);
  return cents !== null && cents > 0 ? cents : null;
}

export function WelcomeCouponForm({
  action,
  initial,
}: {
  action: CouponFormAction;
  initial: WelcomeCouponView;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [savedCount, setSavedCount] = useState(0);
  const { dirty, onChange, ref } = useDirtyForm(savedCount);
  const headingId = useId();
  const [active, setActive] = useState(initial.active);
  const [kind, setKind] = useState<"percent" | "fixed">(initial.discount?.kind ?? "percent");
  const [percent, setPercent] = useState<number | null>(
    initial.discount?.kind === "percent" ? initial.discount.percent : null,
  );
  const [maxDiscountCents, setMax] = useState<number | null>(
    initial.discount?.kind === "percent" ? initial.discount.maxDiscountCents : null,
  );
  const [amountCents, setAmount] = useState<number | null>(
    initial.discount?.kind === "fixed" ? initial.discount.amountCents : null,
  );
  const [minOrderCents, setMin] = useState<number | null>(initial.minOrderCents);

  useEffect(() => {
    if (state.status === "success") setSavedCount((n) => n + 1);
  }, [state]);

  const discount =
    kind === "fixed"
      ? amountCents
        ? { kind: "fixed" as const, amountCents }
        : null
      : percent && percent >= 1 && percent <= 100
        ? { kind: "percent" as const, maxDiscountCents, percent }
        : null;
  const { errors } = state;

  return (
    <OutlineContainer as="section" aria-labelledby={headingId} className="p-5 md:p-7">
      <ActionForm
        formRef={ref}
        action={formAction}
        state={state}
        noValidate
        onChange={onChange}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            id={headingId}
            description="Quem entra com a conta Foode (código no WhatsApp) e faz a primeira compra nesta Loja ganha o desconto sozinho no checkout. Uma vez por conta; quem já pediu aqui, mesmo sem conta, não recebe."
          >
            Cupom de boas-vindas
          </SectionHeading>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
            <input
              type="checkbox"
              role="switch"
              aria-checked={active}
              name="active"
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
              className="size-5 accent-[var(--color-primary-strong)]"
            />
            Programa {active ? "ligado" : "desligado"}
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-bold text-[var(--color-ink)]">Tipo de desconto</legend>
          <div className="mt-2 inline-flex rounded-full border border-[var(--color-hairline)] p-1">
            {(
              [
                ["percent", "Percentual (%)"],
                ["fixed", "Valor fixo (R$)"],
              ] as const
            ).map(([option, label]) => (
              <label
                key={option}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold ${
                  kind === option
                    ? "bg-[var(--color-primary-strong)] text-white"
                    : "text-[var(--color-body)]"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-3">
          {kind === "percent" ? (
            <>
              <Field
                id="welcome-percent"
                name="percent"
                label="Desconto (%)"
                inputMode="numeric"
                defaultValue={percent ?? ""}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const digits = event.currentTarget.value.replace(/\D/gu, "");
                  setPercent(digits ? Number(digits) : null);
                }}
                placeholder="10"
                error={errors.percent}
              />
              <Field
                id="welcome-max"
                name="maxDiscountCents"
                label="Teto em R$ (opcional)"
                inputMode="numeric"
                data-money=""
                defaultValue={maxDiscountCents === null ? "" : centsToInput(maxDiscountCents)}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setMax(moneyValue(event.currentTarget.value))
                }
                placeholder="R$ 20,00"
                error={errors.maxDiscountCents}
              />
            </>
          ) : (
            <Field
              id="welcome-amount"
              name="amountCents"
              label="Desconto em R$"
              inputMode="numeric"
              data-money=""
              defaultValue={amountCents === null ? "" : centsToInput(amountCents)}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setAmount(moneyValue(event.currentTarget.value))
              }
              placeholder="R$ 10,00"
              error={errors.amountCents}
            />
          )}
          <Field
            id="welcome-min"
            name="minOrderCents"
            label="Pedido mínimo em R$ (opcional)"
            inputMode="numeric"
            data-money=""
            defaultValue={minOrderCents === null ? "" : centsToInput(minOrderCents)}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setMin(moneyValue(event.currentTarget.value))
            }
            placeholder="R$ 30,00"
            error={errors.minOrderCents}
          />
        </div>

        <p
          aria-live="polite"
          className="rounded-2xl border border-[var(--color-primary)] px-4 py-3 text-sm font-bold text-[var(--color-ink)]"
          role="status"
        >
          {welcomeSummaryPt({ active, discount, minOrderCents })}
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton variant="secondary" disabled={!dirty}>
            Salvar alterações
          </SubmitButton>
          {!dirty && state.status !== "success" ? (
            <p className="text-sm text-[var(--color-muted)]">
              {initial.redeemedCount > 0
                ? `${initial.redeemedCount} Pedido${initial.redeemedCount === 1 ? "" : "s"} com boas-vindas nesta Loja.`
                : "Nenhuma alteração para salvar."}
            </p>
          ) : null}
          <div className="min-w-0 flex-1">
            <ActionNotice state={dirty && state.status === "success" ? IDLE_FORM : state} />
          </div>
        </div>
      </ActionForm>
    </OutlineContainer>
  );
}
