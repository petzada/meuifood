"use client";

// Ações rápidas da lista do Cardápio: cada uma é um formulário pequeno com feedback junto da
// ação (T-05): sucesso some em 4 s, erro fica até a próxima tentativa. Disponibilidade com
// rótulo de ESTADO (CAR-02), reordenar por botões acessíveis (CAR-04) e preço inline só com
// confirmação explícita (CAR-03: Enter ou ✓; Esc desfaz; nunca salva no blur).
import { formatBRL, reaisToCents } from "@foode/shared/money";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import { availabilityLabel } from "../../../../lib/menu-labels";
import { centsToInput } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import type { MenuAction } from "../actions";

const SUCCESS_TTL_MS = 4000;

/** `useActionState` com sucesso que some sozinho (erro fica). */
export function useQuickAction(action: MenuAction): [FormState, (formData: FormData) => void] {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [visible, setVisible] = useState<FormState>(IDLE_FORM);
  useEffect(() => {
    setVisible(state);
    if (state.status !== "success") return;
    const timer = setTimeout(() => setVisible(IDLE_FORM), SUCCESS_TTL_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return [visible, formAction];
}

/** Mensagem curta junto do controle. */
export function QuickFeedback({ state, className = "" }: { state: FormState; className?: string }) {
  const message =
    state.status === "error"
      ? (state.message ?? Object.values(state.errors)[0] ?? "Não foi possível salvar.")
      : state.status === "success"
        ? state.message
        : null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`text-xs font-bold ${state.status === "error" ? "text-[var(--color-error)]" : "text-[#1f6b41]"} ${message ? "" : "sr-only"} ${className}`}
    >
      {message ?? ""}
    </p>
  );
}

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

// ---- Disponibilidade (CAR-02) ----

function SwitchButton({ available, label }: { available: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={available}
      aria-label={`${label}: ${availabilityLabel(available)}`}
      disabled={pending}
      className={`group inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:opacity-60 ${
        available
          ? "border-[#2e8b57] text-[#1f6b41]"
          : "border-[var(--color-hairline)] text-[var(--color-muted)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors ${
          available ? "border-[#2e8b57] bg-[#2e8b57]" : "border-[var(--color-muted)] bg-transparent"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3.5 rounded-full transition-transform motion-reduce:transition-none ${
            available
              ? "left-0.5 translate-x-4 bg-white"
              : "left-0.5 translate-x-0 bg-[var(--color-muted)]"
          }`}
        />
      </span>
      {pending ? "Salvando..." : availabilityLabel(available)}
    </button>
  );
}

/**
 * Interruptor de disponibilidade: salva na hora e mostra o estado por texto. `idName` é o nome
 * do id na action (`itemId`, `categoryId`, `additionalId`).
 */
export function AvailabilitySwitch({
  action,
  available,
  id,
  idName,
  label,
}: {
  action: MenuAction;
  available: boolean;
  id: string;
  idName: string;
  label: string;
}) {
  const [state, formAction] = useQuickAction(action);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Hidden fields={{ [idName]: id, available: String(!available), label }} />
      <SwitchButton available={available} label={label} />
      <QuickFeedback state={state} />
    </form>
  );
}

// ---- Reordenar (CAR-04) ----

function ArrowButton({
  children,
  direction,
  disabled,
  label,
}: {
  children: ReactNode;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="direction"
      value={direction}
      aria-label={label}
      disabled={disabled || pending}
      className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--color-hairline)] text-base font-bold text-[var(--color-body)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-hairline)] disabled:hover:text-[var(--color-body)]"
    >
      {children}
    </button>
  );
}

/** Botões "Mover para cima/baixo" (teclado e leitor de tela). Manda a lista inteira à action. */
export function ReorderButtons({
  action,
  hidden = {},
  id,
  ids,
  label,
}: {
  action: MenuAction;
  /** Campos extras da action (ex.: `categoryId`). */
  hidden?: Record<string, string>;
  id: string;
  ids: readonly string[];
  /** Nome do objeto para o rótulo acessível ("Mover Misto Quente para cima"). */
  label: string;
}) {
  const [state, formAction] = useQuickAction(action);
  const index = ids.indexOf(id);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Hidden fields={{ ...hidden, moveId: id }} />
      {ids.map((orderedId) => (
        <input key={orderedId} type="hidden" name="orderedIds" value={orderedId} />
      ))}
      <div className="flex gap-1" aria-label={`Ordem de ${label}`}>
        <ArrowButton direction="up" disabled={index <= 0} label={`Mover ${label} para cima`}>
          ↑
        </ArrowButton>
        <ArrowButton
          direction="down"
          disabled={index === -1 || index >= ids.length - 1}
          label={`Mover ${label} para baixo`}
        >
          ↓
        </ArrowButton>
      </div>
      <QuickFeedback state={state} />
    </form>
  );
}

// ---- Preço inline (P-CAR-5, CAR-03) ----

function PriceConfirm({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Salvar preço"
      title="Salvar preço (Enter)"
      disabled={!dirty || pending}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-primary)] text-base font-bold text-[var(--color-primary-strong)] transition-opacity focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:opacity-0 disabled:pointer-events-none"
    >
      {pending ? "…" : "✓"}
    </button>
  );
}

export function InlinePrice({
  action,
  itemId,
  label,
  priceCents,
}: {
  action: MenuAction;
  itemId: string;
  label: string;
  priceCents: number;
}) {
  const [state, formAction] = useQuickAction(action);
  const inputId = useId();
  const baseline = centsToInput(priceCents);
  const [value, setValue] = useState(baseline);
  const lastSaved = useRef(priceCents);

  // Preço novo vindo do servidor (depois de salvar ou de outra aba): realinha o campo.
  useEffect(() => {
    if (lastSaved.current !== priceCents) {
      lastSaved.current = priceCents;
      setValue(centsToInput(priceCents));
    }
  }, [priceCents]);

  const parsed = reaisToCents(value);
  const dirty = parsed !== null && parsed !== priceCents;
  const invalid = value.trim() !== "" && parsed === null;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setValue(baseline);
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (!dirty) event.preventDefault();
      }}
    >
      <Hidden fields={{ itemId }} />
      <div className="flex items-center gap-1">
        <label htmlFor={inputId} className="sr-only">
          Preço de {label} em reais
        </label>
        <span aria-hidden="true" className="text-sm font-bold text-[var(--color-muted)]">
          R$
        </span>
        <input
          id={inputId}
          name="priceCents"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={`${inputId}-dica`}
          className={`min-h-11 w-24 rounded-xl border bg-transparent px-3 text-right text-sm font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)] ${
            invalid ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"
          }`}
        />
        <PriceConfirm dirty={dirty} />
      </div>
      <p id={`${inputId}-dica`} className="sr-only">
        Enter salva, Esc desfaz. Preço atual {formatBRL(priceCents)}.
      </p>
      {dirty && state.status !== "error" ? (
        <p className="text-xs text-[var(--color-muted)]">Enter salva · Esc desfaz</p>
      ) : null}
      {invalid ? (
        <p role="alert" className="text-xs font-bold text-[var(--color-error)]">
          Use só números, com vírgula para centavos.
        </p>
      ) : (
        <QuickFeedback state={state} />
      )}
    </form>
  );
}

// ---- Ação destrutiva com confirmação que nomeia o objeto (T-12) ----

export function ConfirmDialogForm({
  action,
  children,
  confirmLabel,
  description,
  hidden,
  pendingLabel = "Apagando...",
  title,
  trigger,
  triggerDisabled = false,
  triggerHint,
}: {
  action: MenuAction;
  children?: ReactNode;
  confirmLabel: string;
  description: ReactNode;
  hidden: Record<string, string>;
  pendingLabel?: string;
  title: string;
  trigger: string;
  triggerDisabled?: boolean;
  triggerHint?: string | undefined;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        disabled={triggerDisabled}
        aria-describedby={triggerHint ? `${titleId}-hint` : undefined}
        className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-error)] transition-colors hover:border-[var(--color-error)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {trigger}
      </button>
      {triggerHint ? (
        <p id={`${titleId}-hint`} className="text-xs text-[var(--color-muted)]">
          {triggerHint}
        </p>
      ) : null}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="w-[min(92vw,30rem)] rounded-3xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0 text-[var(--color-ink)] backdrop:bg-black/40"
      >
        <form action={formAction} className="space-y-5 p-6">
          <Hidden fields={hidden} />
          <h3 id={titleId} className="text-xl font-bold tracking-[-0.02em]">
            {title}
          </h3>
          <div className="text-sm leading-relaxed text-[var(--color-body)]">{description}</div>
          {children}
          {state.status === "error" ? (
            <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
              {state.message ?? Object.values(state.errors)[0]}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="foode-button foode-button--secondary"
            >
              Voltar
            </button>
            <DangerSubmit pendingLabel={pendingLabel}>{confirmLabel}</DangerSubmit>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function DangerSubmit({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="foode-button border-[var(--color-error)] bg-[var(--color-error)] text-white hover:bg-[#a52d12] disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
