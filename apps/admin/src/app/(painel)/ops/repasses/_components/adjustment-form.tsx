"use client";

// Ajuste auditado (OPS-04; única correção de lote pago): crédito ou débito ao lojista com motivo e,
// opcionalmente, o lote corrigido. Entra no próximo lote da Loja. Abre em modal (decisão 74).
import { Button } from "@foode/ui";
import { PAYOUT_ADJUSTMENT_REASON_MAX, PAYOUT_ADJUSTMENT_REASON_MIN } from "@foode/shared/finance";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { ActionForm, ActionNotice } from "../../../../../components/action-form";
import { CadastroFooter, CadastroModal } from "../../../../../components/cadastro-modal";
import { Field } from "../../../../../components/form";
import { IDLE_FORM, type FormState } from "../../../../../lib/ops-forms";
import { SelectField, TextareaField } from "../../_components/fields";
import { SubmitButton } from "../../_components/submit-button";

export type AdjustmentAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export type AdjustmentStoreOption = { id: string; name: string };

export function AdjustmentButton({
  action,
  batches,
  stores,
}: {
  action: AdjustmentAction;
  /** Lotes pagos da Loja selecionada na tela (opção "lote corrigido"). */
  batches: { id: string; storeId: string; label: string }[];
  stores: AdjustmentStoreOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Lançar ajuste
      </Button>
      {open ? (
        <AdjustmentModal
          action={action}
          batches={batches}
          onClose={() => setOpen(false)}
          stores={stores}
        />
      ) : null}
    </>
  );
}

function AdjustmentModal({
  action,
  batches,
  onClose,
  stores,
}: {
  action: AdjustmentAction;
  batches: { id: string; storeId: string; label: string }[];
  onClose: () => void;
  stores: AdjustmentStoreOption[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(action, IDLE_FORM);
  const [dirty, setDirty] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (state.status !== "success") return;
    closeRef.current();
    router.refresh();
  }, [router, state]);

  const errors = state.status === "error" ? state.errors : {};
  const storeBatches = batches.filter((batch) => batch.storeId === storeId);

  return (
    <CadastroModal
      open
      dirty={dirty && state.status !== "success"}
      onClose={onClose}
      size="md"
      title="Lançar ajuste"
      description="Crédito ou débito ao lojista, com motivo. Entra no próximo lote da Loja e fica na auditoria; é a única forma de corrigir um lote pago."
    >
      <ActionForm
        action={dispatch}
        state={state}
        onChange={() => setDirty(true)}
        resetOnSuccess={false}
        className="space-y-5"
      >
        <SelectField
          id="ajuste-storeId"
          name="storeId"
          label="Loja"
          value={storeId}
          onChange={(event) => setStoreId(event.currentTarget.value)}
          error={errors.storeId}
          autoFocus
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </SelectField>
        <fieldset>
          <legend className="text-sm font-bold text-[var(--color-ink)]">Tipo</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--color-ink)]">
              <input type="radio" name="direction" value="credit" defaultChecked /> Crédito ao
              lojista (+)
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--color-ink)]">
              <input type="radio" name="direction" value="debit" /> Débito do lojista (−)
            </label>
          </div>
          {errors.direction ? (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-error)]">{errors.direction}</p>
          ) : null}
        </fieldset>
        <Field
          id="ajuste-amountCents"
          name="amountCents"
          label="Valor"
          inputMode="numeric"
          data-money=""
          required
          error={errors.amountCents}
        />
        <TextareaField
          id="ajuste-reason"
          name="reason"
          label="Motivo"
          minLength={PAYOUT_ADJUSTMENT_REASON_MIN}
          maxLength={PAYOUT_ADJUSTMENT_REASON_MAX}
          required
          error={errors.reason}
          hint={`${PAYOUT_ADJUSTMENT_REASON_MIN} a ${PAYOUT_ADJUSTMENT_REASON_MAX} caracteres; o Dono vê este texto em Repasses.`}
        />
        <SelectField
          id="ajuste-batchId"
          name="batchId"
          label="Lote corrigido (opcional)"
          defaultValue=""
          error={errors.batchId}
          hint={
            storeBatches.length === 0
              ? "Nenhum lote pago desta Loja no período da tela."
              : undefined
          }
        >
          <option value="">Nenhum</option>
          {storeBatches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.label}
            </option>
          ))}
        </SelectField>
        <ActionNotice state={state} />
        <CadastroFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton pendingLabel="Lançando...">Lançar ajuste</SubmitButton>
        </CadastroFooter>
      </ActionForm>
    </CadastroModal>
  );
}
