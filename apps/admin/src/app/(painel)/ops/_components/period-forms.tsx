"use client";

// Formulários com vigência: nova taxa Foode, novo custo de provedor e "encerrar vigência".
// Datas digitadas em São Paulo, enviadas em UTC; valores em R$ e %, enviados em centavos/bp.
// Confirmação com resumo antes de gravar (OPS-04): o botão vira "Confirmar" com o resumo.
import {
  CARD_MODES,
  FEE_PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PROVIDER_OPERATIONS_BY_PROVIDER,
} from "@foode/shared/ops";
import { useActionState, useId, useRef, useState, type FormEvent } from "react";

import { Field } from "../../../../components/form";
import {
  formatBps,
  formatCents,
  formatDateTimeSp,
  parseMoneyToCents,
  parsePercentToBps,
  utcIsoToZonedInput,
  zonedInputToUtcIso,
} from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import {
  CARD_MODE_LABEL,
  FEE_METHOD_LABEL,
  PROVIDER_LABEL,
  PROVIDER_OPERATION_LABEL,
} from "../../../../lib/ops-labels";
import { ActionNotice, SelectField } from "./fields";
import { SubmitButton } from "./submit-button";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Resumo "X% + R$ Y, vale a partir de DD/MM/AAAA HH:mm" a partir do que está digitado. */
function summarize(form: HTMLFormElement, subject: string): string | null {
  const data = new FormData(form);
  const bps = parsePercentToBps(String(data.get("percentBps") ?? ""));
  const cents = parseMoneyToCents(String(data.get("fixedCents") ?? "") || "0");
  const from = zonedInputToUtcIso(String(data.get("validFrom") ?? ""));
  const toRaw = String(data.get("validTo") ?? "");
  const to = toRaw ? zonedInputToUtcIso(toRaw) : null;
  if (bps === null || cents === null || !from || (toRaw && !to)) return null;
  const fixed = cents > 0 ? ` + ${formatCents(cents)}` : "";
  const until = to ? ` até ${formatDateTimeSp(to)}` : "";
  return `${subject}: ${formatBps(bps)}${fixed}, vale a partir de ${formatDateTimeSp(from)}${until}.`;
}

/** Envio em duas etapas: 1º clique mostra o resumo, 2º confirma. */
function useConfirm(subjectOf: (form: HTMLFormElement) => string) {
  const [summary, setSummary] = useState<string | null>(null);
  const confirmed = useRef(false);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      setSummary(null);
      return;
    }
    const text = summarize(event.currentTarget, subjectOf(event.currentTarget));
    if (text === null) return; // deixa o Zod apontar o campo
    event.preventDefault();
    setSummary(text);
  }
  function confirm() {
    confirmed.current = true;
  }
  function cancel() {
    confirmed.current = false;
    setSummary(null);
  }
  return { cancel, confirm, onSubmit, summary };
}

function ConfirmBar({
  cancel,
  confirm,
  label,
  summary,
}: {
  cancel: () => void;
  confirm: () => void;
  label: string;
  summary: string | null;
}) {
  if (!summary) {
    return (
      <SubmitButton variant="secondary" pendingLabel="Gravando...">
        {label}
      </SubmitButton>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-primary)] p-4" role="status">
      <p className="text-sm font-bold text-[var(--color-ink)]">{summary}</p>
      <p className="text-sm text-[var(--color-body)]">
        O valor não poderá ser editado depois, só encerrado.
      </p>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Gravando..." onClick={confirm}>
          Confirmar
        </SubmitButton>
        <button
          type="button"
          onClick={cancel}
          className="foode-button foode-button--secondary min-h-11"
        >
          Voltar e ajustar
        </button>
      </div>
    </div>
  );
}

function PeriodFields({
  errors,
  withEnd = true,
}: {
  errors: Record<string, string>;
  withEnd?: boolean;
}) {
  const now = utcIsoToZonedInput(new Date().toISOString());
  return (
    <>
      <Field
        id={`valid-from-${withEnd ? "a" : "b"}`}
        name="validFrom"
        type="datetime-local"
        label="Vale a partir de"
        defaultValue={now}
        hint="Horário de Brasília."
        error={errors.validFrom}
      />
      {withEnd ? (
        <Field
          id="valid-to"
          name="validTo"
          type="datetime-local"
          label="Fim da vigência (opcional)"
          hint="Vazio = sem fim."
          error={errors.validTo}
        />
      ) : null}
    </>
  );
}

function RateFields({ errors }: { errors: Record<string, string> }) {
  return (
    <>
      <Field
        id="percent"
        name="percentBps"
        label="Percentual (%)"
        inputMode="decimal"
        placeholder="3,49"
        error={errors.percentBps}
      />
      <Field
        id="fixed"
        name="fixedCents"
        label="Fixo por transação (R$)"
        inputMode="decimal"
        placeholder="0,00"
        hint="Vazio = R$ 0,00."
        error={errors.fixedCents}
      />
    </>
  );
}

export function PaymentFeeForm({ action, storeId }: { action: Action; storeId: string | null }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [method, setMethod] = useState<string>("pix");
  const confirm = useConfirm((form) => {
    const data = new FormData(form);
    const m = String(data.get("method"));
    const mode = String(data.get("cardMode") ?? "");
    const label =
      m === "credit" && (mode === "normal" || mode === "rapido")
        ? `${FEE_METHOD_LABEL.credit} · ${CARD_MODE_LABEL[mode]}`
        : FEE_METHOD_LABEL.pix;
    return `Taxa Foode ${storeId ? "desta Loja" : "padrão"} em ${label}`;
  });
  const formId = useId();

  return (
    <form
      action={formAction}
      onSubmit={confirm.onSubmit}
      onChange={confirm.cancel}
      noValidate
      className="space-y-5"
      id={formId}
    >
      <input type="hidden" name="storeId" value={storeId ?? ""} />
      <div className="grid gap-5 md:grid-cols-2">
        <SelectField
          id="fee-method"
          name="method"
          label="Meio"
          defaultValue="pix"
          error={state.errors.method}
          onChange={(event) => setMethod(event.currentTarget.value)}
        >
          {FEE_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {FEE_METHOD_LABEL[m]}
            </option>
          ))}
        </SelectField>
        {method === "credit" ? (
          <SelectField
            id="fee-card-mode"
            name="cardMode"
            label="Modo do cartão"
            defaultValue="normal"
            error={state.errors.cardMode}
          >
            {CARD_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {CARD_MODE_LABEL[mode]}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="self-end pb-3 text-sm text-[var(--color-muted)]">PIX não tem modo.</p>
        )}
        <RateFields errors={state.errors} />
        <PeriodFields errors={state.errors} />
      </div>
      <ActionNotice state={state} />
      <ConfirmBar {...confirm} label="Cadastrar taxa" />
    </form>
  );
}

export function ProviderCostForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [provider, setProvider] = useState<(typeof PAYMENT_PROVIDERS)[number]>("abacatepay");
  const confirm = useConfirm((form) => {
    const data = new FormData(form);
    const p = String(data.get("provider")) as (typeof PAYMENT_PROVIDERS)[number];
    const op = String(data.get("operation")) as keyof typeof PROVIDER_OPERATION_LABEL;
    return `Custo ${PROVIDER_LABEL[p] ?? p} · ${PROVIDER_OPERATION_LABEL[op] ?? op}`;
  });

  return (
    <form
      action={formAction}
      onSubmit={confirm.onSubmit}
      onChange={confirm.cancel}
      noValidate
      className="space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <SelectField
          id="cost-provider"
          name="provider"
          label="Provedor"
          defaultValue={provider}
          error={state.errors.provider}
          onChange={(event) =>
            setProvider(event.currentTarget.value as (typeof PAYMENT_PROVIDERS)[number])
          }
        >
          {PAYMENT_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField
          key={provider}
          id="cost-operation"
          name="operation"
          label="Operação"
          error={state.errors.operation}
        >
          {PROVIDER_OPERATIONS_BY_PROVIDER[provider].map((op) => (
            <option key={op} value={op}>
              {PROVIDER_OPERATION_LABEL[op]}
            </option>
          ))}
        </SelectField>
        <RateFields errors={state.errors} />
        <PeriodFields errors={state.errors} />
      </div>
      <ActionNotice state={state} />
      <ConfirmBar {...confirm} label="Cadastrar custo" />
    </form>
  );
}

/** Encerrar a vigência de uma taxa/custo: só grava `validTo`, nunca reescreve o valor. */
export function EndPeriodForm({
  action,
  idName,
  label,
  recordId,
  storeId,
}: {
  action: Action;
  idName: "feeId" | "costId";
  label: string;
  recordId: string;
  storeId?: string | null;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [open, setOpen] = useState(false);
  const now = utcIsoToZonedInput(new Date().toISOString());
  const fieldId = useId();

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-bold text-[var(--color-ink)] underline-offset-4 hover:underline"
        >
          Encerrar vigência
        </button>
        {state.status === "success" ? <ActionNotice state={state} /> : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="space-y-3 rounded-2xl border border-[var(--color-hairline)] p-3"
    >
      <input type="hidden" name={idName} value={recordId} />
      {storeId !== undefined ? <input type="hidden" name="storeId" value={storeId ?? ""} /> : null}
      <Field
        id={fieldId}
        name="validTo"
        type="datetime-local"
        label={`Encerrar ${label} em`}
        defaultValue={now}
        error={state.errors.validTo}
      />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="secondary" pendingLabel="Encerrando...">
          Confirmar encerramento
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="foode-button foode-button--secondary min-h-11"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
