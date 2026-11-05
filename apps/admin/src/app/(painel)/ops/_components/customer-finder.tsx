"use client";

// Conta do Consumidor no Ops (Ticket 13, decisão 65): busca por telefone ou CPF (nunca na URL),
// ficha com CPF mascarado e a troca de telefone em duas etapas — o botão vira "Confirmar" com
// a consequência nomeada (OPS-04): o número antigo deixa de entrar, as sessões caem e a troca
// fica auditada (quem, quando, antes/depois). O Consumidor não troca o próprio número.
import { maskPhoneE164, type OpsCustomerView } from "@foode/shared/customer";
import { OutlineContainer } from "@foode/ui";
import { useActionState, useId, useState, type ChangeEvent, type FormEvent } from "react";

import { Field } from "../../../../components/form";
import { formatDateTimeSp, maskCpf, maskPhoneBr } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, Facts, SectionHeading } from "./fields";
import { SubmitButton } from "./submit-button";
import { ActionForm } from "../../../../components/action-form";

export type CustomerFindState = FormState & { customer: OpsCustomerView | null };
export const IDLE_CUSTOMER_FIND: CustomerFindState = { status: "idle", errors: {}, customer: null };

export type FindCustomerAction = (
  prev: CustomerFindState,
  formData: FormData,
) => Promise<CustomerFindState>;
export type ChangePhoneAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function masked(mask: (value: string) => string) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    input.value = mask(input.value);
  };
}

export function CustomerFinder({
  changePhone,
  find,
}: {
  changePhone: ChangePhoneAction;
  find: FindCustomerAction;
}) {
  const [state, findAction] = useActionState(find, IDLE_CUSTOMER_FIND);
  const [by, setBy] = useState<"phone" | "cpf">("phone");
  const headingId = useId();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.5fr)]">
      <OutlineContainer as="section" aria-labelledby={headingId} className="p-6">
        <SectionHeading
          id={headingId}
          description="Uma conta por telefone e por CPF. O CPF volta mascarado; nenhum dado de Pedido aparece aqui."
        >
          Buscar conta
        </SectionHeading>
        <ActionForm action={findAction} state={state} noValidate className="mt-5 space-y-4">
          <fieldset>
            <legend className="text-sm font-bold text-[var(--color-ink)]">Buscar por</legend>
            <div className="mt-2 flex gap-4">
              {(
                [
                  ["phone", "Telefone"],
                  ["cpf", "CPF"],
                ] as const
              ).map(([option, label]) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="by"
                    value={option}
                    checked={by === option}
                    onChange={() => setBy(option)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {by === "phone" ? (
            <Field
              id="find-phone"
              name="phone"
              label="WhatsApp do Consumidor"
              inputMode="tel"
              autoComplete="off"
              onChange={masked(maskPhoneBr)}
              placeholder="(11) 91234-5678"
              error={state.errors.phone}
            />
          ) : (
            <Field
              id="find-cpf"
              name="cpf"
              label="CPF do Consumidor"
              inputMode="numeric"
              autoComplete="off"
              onChange={masked(maskCpf)}
              placeholder="000.000.000-00"
              error={state.errors.cpf}
            />
          )}
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pendingLabel="Buscando...">Buscar</SubmitButton>
            {state.status === "error" ? (
              <div className="min-w-0 flex-1">
                <ActionNotice state={state} />
              </div>
            ) : null}
          </div>
        </ActionForm>
      </OutlineContainer>

      {state.customer ? (
        <CustomerCard changePhone={changePhone} customer={state.customer} />
      ) : (
        <OutlineContainer className="p-6 text-sm text-[var(--color-muted)]">
          Busque pelo telefone ou pelo CPF para ver a conta e trocar o número.
        </OutlineContainer>
      )}
    </div>
  );
}

function CustomerCard({
  changePhone,
  customer,
}: {
  changePhone: ChangePhoneAction;
  customer: OpsCustomerView;
}) {
  const [state, action] = useActionState(changePhone, IDLE_FORM);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const headingId = useId();
  const done = state.status === "success";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pendingPhone !== null) {
      // 2ª etapa: confirmado, deixa a action rodar.
      setPendingPhone(null);
      return;
    }
    const phone = String(new FormData(event.currentTarget).get("phone") ?? "").trim();
    if (!phone) return; // o Zod aponta o campo
    event.preventDefault();
    setPendingPhone(phone);
  }

  return (
    <OutlineContainer as="section" aria-labelledby={headingId} className="space-y-6 p-6">
      <SectionHeading id={headingId}>{customer.name}</SectionHeading>
      <Facts
        items={[
          { label: "WhatsApp atual", value: maskPhoneBr(customer.phone) },
          { label: "CPF", value: customer.cpfMasked },
          { label: "Conta criada em", value: formatDateTimeSp(customer.createdAt) },
        ]}
      />

      <ActionForm
        action={action}
        state={state}
        noValidate
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <input type="hidden" name="accountId" value={customer.accountId} />
        <Field
          id="new-phone"
          name="phone"
          label="Novo WhatsApp"
          inputMode="tel"
          autoComplete="off"
          onChange={masked(maskPhoneBr)}
          placeholder="(11) 91234-5678"
          hint="O Consumidor não troca o próprio número: só o Ops, com auditoria."
          error={state.errors.phone}
          disabled={done}
        />
        {pendingPhone === null ? (
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton variant="secondary" disabled={done}>
              Trocar telefone
            </SubmitButton>
            <div className="min-w-0 flex-1">
              <ActionNotice state={state} />
            </div>
          </div>
        ) : (
          <div
            className="space-y-3 rounded-2xl border border-[var(--color-primary)] p-4"
            role="status"
          >
            <p className="text-sm font-bold text-[var(--color-ink)]">
              Trocar o WhatsApp de {customer.name} de {maskPhoneE164(customer.phone)} para{" "}
              {pendingPhone}?
            </p>
            <p className="text-sm text-[var(--color-body)]">
              O número antigo deixa de entrar nesta conta na hora e as sessões abertas caem. Os
              Pedidos já vinculados continuam na conta. A troca fica registrada com quem fez, quando
              e o número anterior.
            </p>
            <div className="flex flex-wrap gap-3">
              <SubmitButton pendingLabel="Trocando...">Confirmar troca</SubmitButton>
              <button
                type="button"
                onClick={() => setPendingPhone(null)}
                className="foode-button foode-button--secondary min-h-11"
              >
                Voltar e ajustar
              </button>
            </div>
          </div>
        )}
      </ActionForm>
    </OutlineContainer>
  );
}
