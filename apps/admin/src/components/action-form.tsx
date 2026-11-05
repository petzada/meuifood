"use client";

// Formulário de server action do Painel (feedback do Dono, item 1). Com `<form action={fn}>` o
// React 19 reseta o formulário depois de TODA action — em erro, o que o usuário digitou sumia.
// Aqui o envio vai por `onSubmit` + `startTransition(dispatch)` (o `useActionState` continua do
// lado de quem usa): em erro nada é resetado, a tela rola até o primeiro campo com erro
// (`aria-invalid="true"`) e dá foco nele; em sucesso o formulário volta aos `defaultValue`
// (o mesmo comportamento de antes, já com os dados revalidados do servidor).
//
// Sem resumo "confira os campos": o erro fica no campo. Só quando a action devolve erro que não
// casa com nenhum campo da tela o `ActionNotice` mostra a mensagem (contexto `FormFallback`).
import {
  createContext,
  type FormHTMLAttributes,
  type RefObject,
  type SubmitEvent,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@foode/ui";

type ActionState = { status: string };

const FormPendingContext = createContext<boolean | null>(null);
const FormFallbackContext = createContext(false);

/** Pendente do formulário: o do `ActionForm` (onSubmit) ou o do `<form action>` nativo. */
export function useFormPending(): boolean {
  const fromContext = useContext(FormPendingContext);
  const { pending } = useFormStatus();
  return fromContext ?? pending;
}

/** true quando a última action falhou sem nenhum campo marcado na tela. */
export function useFormFallback(): boolean {
  return useContext(FormFallbackContext);
}

const FOCUSABLE = "input:not([type=hidden]):not([disabled]),select,textarea,button,[tabindex]";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Rola até o primeiro campo inválido (ordem do DOM) e dá foco nele; null se não houver. */
export function focusFirstInvalid(root: HTMLElement): HTMLElement | null {
  const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return null;
  const target = invalid.matches(FOCUSABLE)
    ? invalid
    : (invalid.querySelector<HTMLElement>(FOCUSABLE) ?? invalid);
  if (target === invalid && !invalid.matches(FOCUSABLE)) invalid.tabIndex = -1;
  target.scrollIntoView?.({
    block: "center",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  target.focus({ preventScroll: true });
  return target;
}

export type ActionFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action"> & {
  /** Dispatch do `useActionState`. */
  action: (formData: FormData) => void;
  /** Estado devolvido pelo `useActionState` (dispara foco no erro / reset no sucesso). */
  state: ActionState;
  /** Ref externa (ex.: `useDirtyForm`). */
  formRef?: RefObject<HTMLFormElement | null>;
  /** Voltar aos `defaultValue` depois de sucesso (padrão: sim, como o `<form action>`). */
  resetOnSuccess?: boolean;
};

export function ActionForm({
  action,
  children,
  formRef,
  onSubmit,
  resetOnSuccess = true,
  state,
  ...form
}: ActionFormProps) {
  const ownRef = useRef<HTMLFormElement>(null);
  const ref = formRef ?? ownRef;
  const [pending, startTransition] = useTransition();
  const [fallback, setFallback] = useState(false);
  const submitted = useRef(false);
  const lastState = useRef(state);

  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    if (!submitted.current) return;
    const element = ref.current;
    if (!element) return;
    if (state.status === "error") {
      const focused = focusFirstInvalid(element);
      setFallback(focused === null);
      if (!focused) {
        element.querySelector<HTMLElement>('[role="alert"]')?.focus?.({ preventScroll: false });
      }
      return;
    }
    setFallback(false);
    if (state.status === "success" && resetOnSuccess) element.reset();
  }, [ref, resetOnSuccess, state]);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null | undefined;
    if (submitter?.name && !data.has(submitter.name)) data.append(submitter.name, submitter.value);
    submitted.current = true;
    startTransition(() => action(data));
  }

  return (
    <FormPendingContext.Provider value={pending}>
      <FormFallbackContext.Provider value={fallback}>
        <form ref={ref} onSubmit={handleSubmit} aria-busy={pending || undefined} {...form}>
          {children}
        </form>
      </FormFallbackContext.Provider>
    </FormPendingContext.Provider>
  );
}

/**
 * Para formulários com `onSubmit` próprio (auth): depois de cada leva de erros, rola até o
 * primeiro campo inválido e dá foco nele. Os valores nunca são resetados (inputs não controlados
 * sem `<form action>`).
 */
export function useFocusFirstError(
  ref: RefObject<HTMLFormElement | null>,
  errors: Record<string, unknown>,
): void {
  useEffect(() => {
    if (!ref.current || Object.keys(errors).length === 0) return;
    focusFirstInvalid(ref.current);
  }, [errors, ref]);
}

type NoticeState = { status: string; message?: string; errors: Record<string, string> };

/**
 * Mensagem já anunciada por estado: o mesmo objeto de estado não repete o Toast ao re-renderizar,
 * nem quando o `fallback` muda depois (erro geral já anunciado não sai duas vezes).
 */
const announced = new WeakMap<object, string>();

/** Mensagem do Toast para o estado da action; null = nada a anunciar (erro só de campo). */
export function noticeMessage(state: NoticeState, fallback: boolean): string | null {
  if (state.status === "idle") return null;
  if (state.status === "success") return state.message ?? "Feito.";
  const fieldErrors = Object.entries(state.errors).filter(([key]) => key !== "form");
  return (
    state.errors.form ??
    (fieldErrors.length === 0
      ? (state.message ?? "Não foi possível salvar. Tente de novo.")
      : fallback
        ? (fieldErrors[0]?.[1] ?? null)
        : null)
  );
}

/**
 * Resultado da action como Toast (decisão 72): sucesso, erro geral da api ou conflito. Erro de
 * campo NÃO vira aviso (fica abaixo do campo); só quando nenhum campo da tela foi marcado
 * (`useFormFallback`) a primeira mensagem de campo vai para o Toast. Não renderiza nada inline.
 */
export function ActionNotice({ state }: { state: NoticeState }) {
  const fallback = useFormFallback();
  const toast = useToast();
  useEffect(() => {
    if (state.status === "idle") return;
    const message = noticeMessage(state, fallback);
    if (!message || announced.get(state) === message) return;
    announced.set(state, message);
    if (state.status === "success") toast.success(message);
    else toast.error(message);
  }, [fallback, state, toast]);
  return null;
}
