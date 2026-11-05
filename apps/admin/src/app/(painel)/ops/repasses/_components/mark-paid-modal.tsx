"use client";

// "Marcar lote pago" (OPS-04; decisão 74: modal/sheet por cima da lista). Duas etapas no mesmo
// formulário: o 1º envio mostra o resumo do que muda (Loja, valor, itens, data, conta,
// identificador, custo do envio e o aviso de imutabilidade) e o 2º confirma. `expectedAmountCents`
// e `asOf` vão no envio: se o lote mudou no meio a api responde `conflict`, a tela avisa e
// recarrega os valores. `idempotencyKey` nasce ao abrir o modal: reenviar o mesmo formulário não
// paga duas vezes.
import { Button } from "@foode/ui";
import {
  type OpsPayoutDueStoreView,
  PAYOUT_SOURCE_ACCOUNTS,
  type PayoutSourceAccount,
} from "@foode/shared/finance";
import { useRouter } from "next/navigation";
import { type FormEvent, useActionState, useEffect, useId, useRef, useState } from "react";

import { ActionForm, ActionNotice } from "../../../../../components/action-form";
import { CadastroFooter, CadastroModal } from "../../../../../components/cadastro-modal";
import { Field } from "../../../../../components/form";
import {
  formatSignedCents,
  markPaidSummary,
  PAYOUT_SOURCE_ACCOUNT_LABEL,
} from "../../../../../lib/finance-labels";
import { formatCents, parseMoneyToCents } from "../../../../../lib/ops-format";
import { IDLE_FORM } from "../../../../../lib/ops-forms";
import type { MarkPaidState } from "../../../../../lib/finance-forms";
import { SelectField } from "../../_components/fields";
import { SubmitButton } from "../../_components/submit-button";

export type MarkPaidAction = (prev: MarkPaidState, formData: FormData) => Promise<MarkPaidState>;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (ambiente sem Web Crypto): UUID v4 por Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (char) => {
    const random = Math.trunc(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function MarkPaidModal({
  action,
  asOf,
  onClose,
  store,
}: {
  action: MarkPaidAction;
  asOf: string;
  onClose: () => void;
  store: OpsPayoutDueStoreView;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(action, IDLE_FORM as MarkPaidState);
  const [summary, setSummary] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const confirmed = useRef(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const summaryId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (state.status !== "success") return;
    closeRef.current();
    router.refresh();
  }, [router, state]);

  useEffect(() => {
    if (state.status === "error" && state.conflict) {
      setSummary(null);
      router.refresh();
    }
  }, [router, state]);

  const errors = state.status === "error" ? state.errors : {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return; // 2º envio: segue para a action
    }
    const data = new FormData(event.currentTarget);
    const paidOn = String(data.get("paidOn") ?? "");
    const sourceAccount = String(data.get("sourceAccount") ?? "") as PayoutSourceAccount;
    const reference = String(data.get("reference") ?? "").trim();
    const transferCost = parseMoneyToCents(String(data.get("transferCostCents") ?? "") || "0");
    if (
      !paidOn ||
      !reference ||
      transferCost === null ||
      !PAYOUT_SOURCE_ACCOUNTS.includes(sourceAccount)
    ) {
      return; // deixa a action apontar o campo
    }
    event.preventDefault();
    setSummary(
      markPaidSummary({
        storeName: store.storeName,
        amountLabel: formatCents(store.amountCents),
        itemCount: store.itemCount,
        entriesLabel: formatCents(store.entriesCents),
        debitsLabel: formatCents(store.debitsCents),
        adjustmentsLabel: store.adjustmentsCents
          ? formatSignedCents(store.adjustmentsCents, formatCents)
          : null,
        paidOn,
        sourceAccount,
        reference,
        transferCostLabel: formatCents(transferCost),
      }),
    );
  }

  return (
    <CadastroModal
      open
      dirty={dirty && state.status !== "success"}
      onClose={onClose}
      size="md"
      title={`Marcar lote pago · ${store.storeName}`}
      description={`Lote de ${store.itemCount} ${store.itemCount === 1 ? "item" : "itens"} com repasse previsto até hoje: ${formatCents(store.amountCents)}. Pix para ${store.payout?.holderName ?? "—"}.`}
    >
      <ActionForm
        action={dispatch}
        state={state}
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        resetOnSuccess={false}
        className="space-y-5"
        aria-describedby={summary ? summaryId : undefined}
      >
        <input type="hidden" name="storeId" value={store.storeId} />
        <input type="hidden" name="asOf" value={asOf} />
        <input type="hidden" name="expectedAmountCents" value={store.amountCents} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <Field
          id="lote-paidOn"
          name="paidOn"
          label="Data do Pix"
          type="date"
          defaultValue={asOf}
          min={asOf}
          required
          autoFocus
          error={errors.paidOn}
          hint="Hoje ou depois (o lote fecha com os itens previstos até hoje)."
        />
        <SelectField
          id="lote-sourceAccount"
          name="sourceAccount"
          label="Conta de saída"
          defaultValue="efi"
          error={errors.sourceAccount}
        >
          {PAYOUT_SOURCE_ACCOUNTS.map((account) => (
            <option key={account} value={account}>
              {PAYOUT_SOURCE_ACCOUNT_LABEL[account]}
            </option>
          ))}
        </SelectField>
        <Field
          id="lote-reference"
          name="reference"
          label="Identificador ou comprovante do Pix"
          maxLength={120}
          required
          error={errors.reference}
          hint="O E2E do Pix ou o número do comprovante; o Dono vê em Repasses."
        />
        <Field
          id="lote-transferCostCents"
          name="transferCostCents"
          label="Custo do envio"
          inputMode="numeric"
          data-money=""
          defaultValue="R$ 0,00"
          error={errors.transferCostCents}
          hint="Tarifa cobrada pela conta de saída; entra na margem, nunca no repasse do Dono."
        />

        {summary ? (
          <div
            id={summaryId}
            role="status"
            className="rounded-xl border border-[var(--color-accent)] px-4 py-3 text-sm text-[var(--color-ink)]"
          >
            <p className="font-bold">Confira antes de confirmar</p>
            <p className="mt-1 leading-relaxed">{summary}</p>
          </div>
        ) : null}

        <ActionNotice state={state} />

        <CadastroFooter>
          {summary ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  confirmed.current = false;
                  setSummary(null);
                }}
              >
                Revisar
              </Button>
              <SubmitButton onClick={() => (confirmed.current = true)} pendingLabel="Marcando...">
                Confirmar lote pago
              </SubmitButton>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <SubmitButton>Marcar lote pago</SubmitButton>
            </>
          )}
        </CadastroFooter>
      </ActionForm>
      {!store.payable ? (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--color-error)]">
          Este lote não pode ser pago:{" "}
          {store.payout ? "o valor não é positivo." : "a Loja não tem conta de repasse cadastrada."}
        </p>
      ) : null}
    </CadastroModal>
  );
}
