"use client";

// Adicionais do item (CAR-05): extras pagos sem limite de escolha (bacon, molho extra). Cada
// linha edita nome e preço (salva só com mudança, T-06), tem disponibilidade inline (CAR-02),
// reordenar por botões (CAR-04) e apagar com confirmação (T-12).
import type { AdminAdditional, AdminMenuItem } from "@foode/shared/menu";
import { useActionState, useId } from "react";

import { Field } from "../../../../components/form";
import { MAX_ADDITIONALS_PER_ITEM } from "../../../../lib/menu-forms";
import { centsToInput } from "../../../../lib/ops-format";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice, EmptyState, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import type { MenuAction } from "../actions";
import { AvailabilitySwitch, ConfirmDialogForm, ReorderButtons } from "./quick-actions";

export type AdditionalActions = {
  createAdditional: MenuAction;
  deleteAdditional: MenuAction;
  reorderAdditionals: MenuAction;
  setAdditionalAvailable: MenuAction;
  updateAdditional: MenuAction;
};

function AdditionalRow({
  actions,
  additional,
  ids,
  itemId,
}: {
  actions: AdditionalActions;
  additional: AdminAdditional;
  ids: string[];
  itemId: string;
}) {
  const [state, formAction] = useActionState(actions.updateAdditional, IDLE_FORM);
  const { dirty, onChange, ref } = useDirtyForm(state.status === "success" ? state : null);
  const id = useId();
  return (
    <li className="rounded-2xl border border-[var(--color-hairline)] p-4">
      <form
        ref={ref}
        action={formAction}
        onChange={onChange}
        className="grid gap-3 md:grid-cols-[1fr_9rem_auto] md:items-end"
      >
        <input type="hidden" name="additionalId" value={additional.id} />
        <Field
          id={`${id}-name`}
          name="name"
          label="Nome"
          defaultValue={additional.name}
          maxLength={120}
          autoComplete="off"
          error={state.errors.name}
        />
        <Field
          id={`${id}-price`}
          name="priceCents"
          label="Preço (R$)"
          defaultValue={centsToInput(additional.priceCents)}
          inputMode="decimal"
          autoComplete="off"
          error={state.errors.priceCents}
        />
        <SubmitButton
          variant="secondary"
          className="min-h-12"
          disabled={!dirty}
          pendingLabel="Salvando..."
        >
          Salvar
        </SubmitButton>
        <div className="md:col-span-3">
          <ActionNotice state={state} />
        </div>
      </form>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-[var(--color-hairline-soft)] pt-3">
        <AvailabilitySwitch
          action={actions.setAdditionalAvailable}
          available={additional.available}
          id={additional.id}
          idName="additionalId"
          label={additional.name}
        />
        <div className="flex flex-wrap items-start gap-2">
          <ReorderButtons
            action={actions.reorderAdditionals}
            hidden={{ itemId }}
            id={additional.id}
            ids={ids}
            label={additional.name}
          />
          <ConfirmDialogForm
            action={actions.deleteAdditional}
            confirmLabel="Apagar Adicional"
            description={
              <p>
                O Adicional <strong>{additional.name}</strong> sai deste item. Pedidos já feitos não
                mudam.
              </p>
            }
            hidden={{ additionalId: additional.id }}
            title={`Apagar ${additional.name}?`}
            trigger="Apagar"
          />
        </div>
      </div>
    </li>
  );
}

function NewAdditionalForm({ action, itemId }: { action: MenuAction; itemId: string }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const id = useId();
  return (
    <form
      key={state.status === "success" ? state.message : "form"}
      action={formAction}
      className="grid gap-3 rounded-2xl border border-dashed border-[var(--color-hairline)] p-4 md:grid-cols-[1fr_9rem_auto] md:items-end"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <Field
        id={`${id}-name`}
        name="name"
        label="Novo Adicional"
        placeholder="Ex.: Bacon"
        maxLength={120}
        autoComplete="off"
        error={state.errors.name}
      />
      <Field
        id={`${id}-price`}
        name="priceCents"
        label="Preço (R$)"
        placeholder="4,00"
        inputMode="decimal"
        autoComplete="off"
        error={state.errors.priceCents}
      />
      <SubmitButton className="min-h-12" pendingLabel="Criando...">
        Criar Adicional
      </SubmitButton>
      <div className="md:col-span-3">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function AdditionalsSection({
  actions,
  item,
}: {
  actions: AdditionalActions;
  item: AdminMenuItem;
}) {
  const headingId = useId();
  const ids = item.additionals.map((additional) => additional.id);
  const full = item.additionals.length >= MAX_ADDITIONALS_PER_ITEM;
  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <SectionHeading
        id={headingId}
        description={`Extras pagos que o Consumidor marca à vontade (bacon, molho extra). Até ${MAX_ADDITIONALS_PER_ITEM} por item.`}
      >
        Adicionais
      </SectionHeading>
      {item.additionals.length === 0 ? (
        <EmptyState title="Este item ainda não tem Adicionais.">
          <p>Cadastre o primeiro abaixo. Escolhas obrigatórias ou limitadas são Complementos.</p>
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {item.additionals.map((additional) => (
            <AdditionalRow
              key={additional.id}
              actions={actions}
              additional={additional}
              ids={ids}
              itemId={item.id}
            />
          ))}
        </ol>
      )}
      {full ? (
        <p role="status" className="text-sm text-[var(--color-body)]">
          Este item chegou ao máximo de {MAX_ADDITIONALS_PER_ITEM} Adicionais.
        </p>
      ) : (
        <NewAdditionalForm action={actions.createAdditional} itemId={item.id} />
      )}
    </section>
  );
}
