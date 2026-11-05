"use client";

// Equipe do Dono (EQP-01): membros da Loja ativa com a situação ("Convite enviado" ou "Ativo"),
// convite de Operador (Turnstile) em modal de cadastro (decisão 74), reenvio do convite para quem
// ainda não definiu senha e remoção com confirmação que nomeia a pessoa e a consequência (T-12).
// Feedback no Toast (decisão 72).
import type { StoreMemberView } from "@foode/shared";
import { Badge, Button } from "@foode/ui";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";

import { ActionForm, useFormPending } from "../../../../components/action-form";
import {
  CadastroFooter,
  CadastroModal,
  StepNavButton,
} from "../../../../components/cadastro-modal";
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

const STATUS_BADGE: Record<
  StoreMemberView["status"],
  { label: string; tone: "accent" | "success" }
> = {
  invited: { label: "Convite enviado", tone: "accent" },
  active: { label: "Ativo", tone: "success" },
};

function displayName(member: StoreMemberView): string {
  return member.name.trim() || member.email;
}

function ResendButton({ name }: { name: string }) {
  const pending = useFormPending();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Reenviar convite para ${name}`}
      className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-primary)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Reenviando..." : "Reenviar convite"}
    </button>
  );
}

/** Reenvio do convite: um clique, sem modal (não é destrutivo); o Toast confirma. */
function ResendInviteForm({ action, member }: { action: Action; member: StoreMemberView }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const name = displayName(member);
  return (
    <ActionForm action={formAction} state={state} resetOnSuccess={false}>
      <input type="hidden" name="membershipId" value={member.membershipId} />
      <input type="hidden" name="name" value={name} />
      <ActionNotice state={state} />
      <ResendButton name={name} />
    </ActionForm>
  );
}

function InviteModal({
  action,
  onClose,
  siteKey,
}: {
  action: Action;
  onClose: () => void;
  siteKey: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [token, setToken] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);

  // Cada token vale uma verificação: depois de qualquer resposta, pede outro. Sucesso fecha (o
  // Toast confirma o envio).
  useEffect(() => {
    if (state.status !== "idle") turnstile.current?.reset();
    if (state.status === "success") onClose();
  }, [onClose, state]);

  return (
    <CadastroModal
      open
      size="md"
      title="Convidar Operador"
      description="A pessoa recebe por e-mail um link para definir a senha e entrar no Painel desta Loja."
      dirty={dirty}
      onClose={onClose}
    >
      <ActionForm
        action={formAction}
        state={state}
        noValidate
        resetOnSuccess={false}
        onChange={(event) => {
          const form = event.currentTarget as HTMLFormElement;
          setDirty(
            Array.from(form.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")).some(
              (input) => input.value !== "",
            ),
          );
        }}
        className="space-y-5"
      >
        <input type="hidden" name="turnstileToken" value={token ?? ""} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="equipe-email"
            name="email"
            type="email"
            label="E-mail"
            inputMode="email"
            autoComplete="off"
            autoFocus
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
        <CadastroFooter>
          <StepNavButton variant="text" onClick={onClose}>
            Cancelar
          </StepNavButton>
          <SubmitButton pendingLabel="Enviando...">Enviar convite</SubmitButton>
        </CadastroFooter>
      </ActionForm>
    </CadastroModal>
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
  resend,
  siteKey,
}: {
  currentUserId: string;
  invite: Action;
  members: StoreMemberView[];
  remove: Action;
  resend: Action;
  siteKey: string;
}) {
  const [removing, setRemoving] = useState<StoreMemberView | null>(null);
  const [inviting, setInviting] = useState(false);
  const listId = useId();
  const close = () => setRemoving(null);
  const closeInvite = useCallback(() => setInviting(false), []);

  return (
    <div className="space-y-8">
      <section aria-labelledby={listId} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading id={listId}>Quem tem acesso</SectionHeading>
          <Button type="button" aria-haspopup="dialog" onClick={() => setInviting(true)}>
            Convidar Operador
          </Button>
        </div>
        {members.length === 0 ? (
          <EmptyState title="Ninguém além de você ainda.">
            Convide um Operador para ajudar na fila de Pedidos.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {members.map((member) => {
              const self = member.userId === currentUserId;
              const status = STATUS_BADGE[member.status];
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
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {self ? (
                        <span className="text-sm text-[var(--color-muted)]">(você)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-[var(--color-muted)]">{member.email}</p>
                  </div>
                  {self ? null : (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {member.status === "invited" ? (
                        <ResendInviteForm action={resend} member={member} />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setRemoving(member)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-error)] transition-colors hover:border-[var(--color-error)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)]"
                      >
                        Remover acesso de {displayName(member)}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inviting ? <InviteModal action={invite} onClose={closeInvite} siteKey={siteKey} /> : null}

      {removing ? <RemoveDialog action={remove} member={removing} onClose={close} /> : null}
    </div>
  );
}
