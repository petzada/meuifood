"use client";

// Diálogo sobre o Painel (feedback do Dono, itens 5 e 6): fundo escurecido e DESFOCADO
// (backdrop-blur), caixa de fundo branco sólido, foco preso dentro (Tab/Shift+Tab circulam),
// Esc fecha quando há `onClose`, foco volta para onde estava ao fechar. Usado pelo tour da fila
// e pelas perguntas de perfil do 1º acesso.
import { type ReactNode, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest("[inert]") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function OverlayDialog({
  children,
  className = "",
  labelledBy,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  /** id do título (nome acessível do diálogo). */
  labelledBy: string;
  /** Esc fecha; ausente = diálogo obrigatório (Esc não faz nada). */
  onClose?: (() => void) | undefined;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = panel.current;
    if (root) (focusables(root)[0] ?? root).focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  // Teclado no documento: o foco pode cair no <body> quando o conteúdo do passo troca.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const root = panel.current;
      if (!root) return;
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = root.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`my-auto w-full rounded-3xl border border-[var(--color-hairline)] bg-white p-6 text-[var(--color-ink)] outline-none md:p-7 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
