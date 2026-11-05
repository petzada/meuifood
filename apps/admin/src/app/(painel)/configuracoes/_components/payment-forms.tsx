"use client";

// Bandeiras da maquininha (P-4.3): Débito e Crédito, lista curta fixa do contrato; nenhuma
// marcada = nada no Storefront. "Imprimir ao aceitar" (P-IMP-1, decisão 64): liga/desliga.
// Cada seção salva sozinha (T-07); edição só com mudança (T-06).
import { CARD_BRAND_LABELS, CARD_BRANDS, type CardBrands } from "@foode/shared/order";
import { useActionState, useId } from "react";

import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import { ActionForm } from "../../../../components/action-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function BrandGroup({
  legend,
  name,
  selected,
}: {
  legend: string;
  name: "debit" | "credit";
  selected: readonly string[];
}) {
  return (
    <fieldset>
      <legend className="font-bold text-[var(--color-ink)]">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {CARD_BRANDS.map((brand) => (
          <label
            key={brand}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)] has-[:checked]:border-[var(--color-primary-strong)] has-[:checked]:text-[var(--color-primary-strong)]"
          >
            <input
              type="checkbox"
              name={name}
              value={brand}
              defaultChecked={selected.includes(brand)}
              className="size-4 accent-[var(--color-primary-strong)]"
            />
            {CARD_BRAND_LABELS[brand]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CardBrandsForm({ action, initial }: { action: Action; initial: CardBrands }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const { dirty, onChange, ref } = useDirtyForm(state);
  const headingId = useId();
  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      className="space-y-5"
    >
      <SectionHeading
        id={headingId}
        description="Bandeiras que a maquininha aceita no Pagamento na entrega. Aparecem no Storefront; nenhuma marcada = nada é exibido."
      >
        Bandeiras da maquininha
      </SectionHeading>
      <BrandGroup legend="Débito" name="debit" selected={initial.debit} />
      <BrandGroup legend="Crédito" name="credit" selected={initial.credit} />
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

export function PrintOnAcceptForm({ action, initial }: { action: Action; initial: boolean }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const { dirty, onChange, ref } = useDirtyForm(state);
  const headingId = useId();
  const id = useId();
  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      className="space-y-5"
    >
      <SectionHeading
        id={headingId}
        description="Ligado, o clique em Começar preparo muda o status e abre a impressão do cupom 80 mm na mesma hora. Desligado, você imprime pelo detalhe do Pedido."
      >
        Imprimir ao aceitar
      </SectionHeading>
      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-3">
        <input
          id={id}
          name="printOnAccept"
          type="checkbox"
          role="switch"
          defaultChecked={initial}
          className="size-5 accent-[var(--color-primary-strong)]"
        />
        <span className="font-bold text-[var(--color-ink)]">Imprimir ao aceitar o Pedido</span>
      </label>
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
