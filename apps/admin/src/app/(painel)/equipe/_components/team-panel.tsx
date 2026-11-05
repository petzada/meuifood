"use client";

// Equipe do Dono (EQP-01): membros da Loja ativa, convite de Operador (Turnstile) e remoção com
// confirmação que nomeia a pessoa e a consequência (T-12). Feedback no Toast (decisão 72).
import type { StoreMemberView } from "@foode/shared";
import { Badge, Button, OutlineContainer } from "@foode/ui";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { ActionForm } from "../../../../components/action-form";
import { Field } from "../../../../components/form";
import { OverlayDialog } from "../../../../components/overlay-dialog";
import { Turnstile, type TurnstileHandle } from "../../../../components/turnstile";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, EmptyState, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const ROLE_LABEL: Record<StoreMemberView["role"], string> = {
  owner: "Dono",
  operator: "Operador",
};

function displayName(member: StoreMemberView): string {
  return member.name.trim() || member.email;
}

function InviteForm({ action, siteKey }: { action: Action; siteKey: string }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [token, setToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const headingId = useId();

  // Cada token vale uma verificação: depois de qualquer resposta, pede outro.
  useEffect(() => {
    if (state.status !== "idle") turnstile.current?.reset();
  }, [state]);

  return (
    <OutlineContainer as="section" aria-labelledby={headingId} className="space-y-5 p-6">
      <SectionHeading
        id={headingId}
        description="A pessoa recebe por e-mail um link para definir a senha e entrar no Painel desta Loja."
      >
        Convidar Operador
      </SectionHeading>
      <ActionForm action={formAction} state={state} noValidate className="space-y-5">
        <input type="hidden" name="turnstileToken" value={token ?? ""} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="equipe-email"
            name="email"
            type="email"
            label="E-mail"
            inputMode="email"
            autoComplete="off"
            error={state.errors.email}
          />
          <Field
            id="equipe-nome"
            name="name"
            label="Nome (opcional)"
            autoComplete="off"
            maxLength={120}
            error={state.errors.name}
          />
        </div>
        <Turnstile ref={turnstile} siteKey={siteKey} onToken={setToken} />
        <ActionNotice state={state} />
        <SubmitButton pendingLabel="Enviando...">Convidar Operador</SubmitButton>
      </ActionForm>
    </OutlineContainer>
  );
}

function RemoveDialog({
  action,
  member,
  onClose,
}: {
  action: Action;
  member: StoreMemberView;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const titleId = useId();
  const name = displayName(member);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state]);

  return (
    <OverlayDialog labelledBy={titleId} onClose={onClose} className="max-w-md">
      <h2 id={titleId} className="text-xl font-bold tracking-[-0.02em]">
        Remover o acesso de {name}?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
        {name} deixa de entrar no Painel desta Loja na hora e não vê mais a fila de Pedidos. Para
        voltar, é preciso um convite novo.
      </p>
      <ActionForm action={formAction} state={state} resetOnSuccess={false} className="mt-5">
        <input type="hidden" name="membershipId" value={member.membershipId} />
        <input type="hidden" name="name" value={name} />
        <ActionNotice state={state} />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>
            Voltar
          </Button>
          <SubmitButton pendingLabel="Removendo...">Remover acesso</SubmitButton>
        </div>
      </ActionForm>
    </OverlayDialog>
  );
}

export function TeamPanel({
  currentUserId,
  invite,
  members,
  remove,
  siteKey,
}: {
  currentUserId: string;
  invite: Action;
  members: StoreMemberView[];
  remove: Action;
  siteKey: string;
}) {
  const [removing, setRemoving] = useState<StoreMemberView | null>(null);
  const listId = useId();
  const close = () => setRemoving(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby={listId} className="space-y-4">
        <SectionHeading id={listId}>Quem tem acesso</SectionHeading>
        {members.length === 0 ? (
          <EmptyState title="Ninguém além de você ainda.">
            Convide um Operador para ajudar na fila de Pedidos.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {members.map((member) => {
              const self = member.userId === currentUserId;
              return (
                <li
                  key={member.membershipId}
                  className="grid gap-3 rounded-2xl border border-[var(--color-hairline)] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-[var(--color-ink)]">
                        {displayName(member)}
                      </span>
                      <Badge tone={member.role === "owner" ? "primary" : "neutral"}>
                        {ROLE_LABEL[member.role]}
                      </Badge>
                      {self ? (
                        <span className="text-sm text-[var(--color-muted)]">(você)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-[var(--color-muted)]">{member.email}</p>
                  </div>
                  {self ? null : (
                    <button
                      type="button"
                      onClick={() => setRemoving(member)}
                      className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-error)] transition-colors hover:border-[var(--color-error)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)]"
                    >
                      Remover acesso de {displayName(member)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <InviteForm action={invite} siteKey={siteKey} />

      {removing ? <RemoveDialog action={remove} member={removing} onClose={close} /> : null}
    </div>
  );
}
