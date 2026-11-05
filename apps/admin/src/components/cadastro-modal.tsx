"use client";

// Padrão de cadastro do Painel (decisão 74): toda criação do lojista abre aqui, por cima da
// página. Desktop (≥ 768 px): modal central com o fundo escurecido e desfocado. Celular
// (< 768 px): sheet inferior que sobe. Foco preso enquanto aberto e devolvido a quem abriu;
// Esc, o X e o clique no fundo pedem para fechar e, com mudança não salva, perguntam antes
// ("Descartar as alterações?"). Cadastros com mais de uma etapa usam `CadastroStepper` (indicador
// de passo, Voltar sem perder dados e "Pular" nas etapas opcionais); a edição usa `CadastroTabs`
// com as mesmas etapas como abas. Painéis das etapas/abas ficam montados (só escondidos), então
// nada digitado se perde ao trocar.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

function readMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** `true` abaixo de 768 px (sheet inferior); no servidor, sempre `false`. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, readMobile, () => false);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest("[hidden]") && !element.closest("dialog:not([open])"),
  );
}

/** Dentro de um `<dialog>` nativo aberto (confirmação de apagar): ele cuida do foco e do Esc. */
function insideNativeDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("dialog[open]") !== null;
}

export type CadastroModalProps = {
  children: ReactNode;
  /** Texto curto abaixo do título. */
  description?: ReactNode;
  /** Há mudança não salva: fechar pergunta antes de descartar. */
  dirty?: boolean;
  onClose: () => void;
  open: boolean;
  /** Largura no desktop: `md` (formulário curto) ou `lg` (etapas, listas). */
  size?: "md" | "lg";
  title: ReactNode;
  /** Conteúdo entre o título e o corpo (indicador de etapas, abas). */
  toolbar?: ReactNode;
};

export function CadastroModal({
  children,
  description,
  dirty = false,
  onClose,
  open,
  size = "lg",
  title,
  toolbar,
}: CadastroModalProps) {
  const mobile = useIsMobile();
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmTitleId = useId();

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  // Foco: entra no modal (no campo com autoFocus, se houver) e volta para quem abriu.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const root = panel.current;
      if (!root || root.contains(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>("[autofocus]") ?? focusables(root)[0];
      (first ?? root).focus();
    });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (insideNativeDialog(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (confirming) setConfirming(false);
      else requestClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const items = focusables(panel.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  const variant = mobile ? "sheet" : "dialog";
  const width = size === "md" ? "md:max-w-xl" : "md:max-w-3xl";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      data-variant={variant}
      data-testid="cadastro-modal-root"
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden="true"
        className="foode-cadastro-backdrop absolute inset-0 bg-black/45 backdrop-blur-sm"
        data-testid="cadastro-modal-fundo"
        onClick={requestClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative flex w-full flex-col overflow-hidden border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink)] outline-none ${
          mobile
            ? "foode-cadastro-sheet max-h-[92dvh] rounded-t-3xl"
            : `foode-cadastro-dialog max-h-[min(88vh,56rem)] rounded-3xl ${width}`
        }`}
      >
        {mobile ? (
          <span
            aria-hidden="true"
            className="mx-auto mt-2.5 block h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-hairline)]"
          />
        ) : null}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-hairline-soft)] px-5 pb-4 pt-4 md:px-7 md:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-[-0.02em]">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-relaxed text-[var(--color-body)]"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fechar"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-hairline)] text-lg font-bold text-[var(--color-body)] hover:border-[var(--color-primary)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)]"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {toolbar ? (
          <div className="shrink-0 border-b border-[var(--color-hairline-soft)] px-5 py-3 md:px-7">
            {toolbar}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-5 md:px-7 md:pb-7">
          {children}
        </div>

        {confirming ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-5">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={confirmTitleId}
              className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-6"
            >
              <h3 id={confirmTitleId} className="text-lg font-bold">
                Descartar as alterações?
              </h3>
              <p className="text-sm text-[var(--color-body)]">
                O que você digitou e ainda não salvou será perdido.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirming(false)}
                  className="foode-button foode-button--secondary"
                >
                  Continuar editando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    onClose();
                  }}
                  className="foode-button border-[var(--color-error)] bg-[var(--color-error)] text-white"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Rodapé fixo no fim do corpo do modal (Voltar · Pular · Continuar/Salvar). */
export function CadastroFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-hairline-soft)] bg-[var(--color-canvas)] px-5 py-4 md:-mx-7 md:-mb-7 md:px-7">
      {children}
    </div>
  );
}

// ---- Etapas ----

export type CadastroStep = {
  id: string;
  label: string;
  /** Etapa que pode ser pulada ("Pular"). */
  optional?: boolean;
};

/** Indicador "Etapa 2 de 3": lista das etapas com a atual marcada (`aria-current="step"`). */
export function StepIndicator({ current, steps }: { current: number; steps: CadastroStep[] }) {
  return (
    <nav aria-label="Etapas do cadastro">
      <p className="sr-only" aria-live="polite">
        Etapa {current + 1} de {steps.length}: {steps[current]?.label}
      </p>
      <ol className="flex flex-wrap items-center gap-2 text-sm font-bold">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "next";
          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 ${
                  state === "current"
                    ? "border-[var(--color-primary)] text-[var(--color-primary-strong)]"
                    : state === "done"
                      ? "border-[var(--color-hairline)] text-[var(--color-ink)]"
                      : "border-[var(--color-hairline)] text-[var(--color-muted)]"
                }`}
              >
                <span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
                {step.label}
                {step.optional ? (
                  <span className="font-normal text-[var(--color-muted)]">(opcional)</span>
                ) : null}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="text-[var(--color-muted)]">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Estado das etapas: índice atual, Voltar e avançar/Pular. */
export function useSteps(steps: CadastroStep[], initial = 0) {
  const [current, setCurrent] = useState(initial);
  const last = current >= steps.length - 1;
  return {
    current,
    step: steps[current]!,
    isFirst: current === 0,
    isLast: last,
    back: () => setCurrent((index) => Math.max(0, index - 1)),
    next: () => setCurrent((index) => Math.min(steps.length - 1, index + 1)),
    goTo: (index: number) => setCurrent(Math.max(0, Math.min(steps.length - 1, index))),
  };
}

/**
 * Painel de uma etapa: fica montado e só é escondido fora da vez, para Voltar não perder
 * nada do que foi digitado.
 */
export function StepPanel({
  active,
  children,
  label,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
}) {
  return (
    <section aria-label={`Etapa: ${label}`} hidden={!active}>
      {children}
    </section>
  );
}

/** Botões de navegação de etapa (fora do envio do formulário). */
export function StepNavButton({
  children,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "text";
}) {
  const classes =
    variant === "text"
      ? "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-[var(--color-body)] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)]"
      : `foode-button foode-button--${variant}`;
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

// ---- Abas (edição) ----

export type CadastroTab = { id: string; label: string; content: ReactNode };

/** Abas acessíveis (setas ←/→, Home/End); todos os painéis ficam montados. */
export function CadastroTabs({
  initial,
  label,
  onSelect,
  selected: controlled,
  tabs,
}: {
  initial?: string;
  label: string;
  /** Modo controlado (ex.: abrir a aba do 1º campo com erro). */
  onSelect?: (id: string) => void;
  selected?: string;
  tabs: CadastroTab[];
}) {
  const [own, setOwn] = useState(initial ?? tabs[0]?.id ?? "");
  const selected = controlled ?? own;
  const setSelected = (id: string) => {
    setOwn(id);
    onSelect?.(id);
  };
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === selected);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const id = tabs[next]!.id;
    setSelected(id);
    refs.current[id]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={move}
        className="sticky -top-5 z-[1] -mx-5 -mt-5 mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-hairline-soft)] bg-[var(--color-canvas)] px-5 md:-mx-7 md:px-7"
      >
        {tabs.map((tab) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-bold focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] ${
                active
                  ? "border-[var(--color-primary)] text-[var(--color-primary-strong)]"
                  : "border-transparent text-[var(--color-body)] hover:text-[var(--color-ink)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selected}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
