"use client";

// Aviso curto e efêmero (`role="status"`, G4/I7): "X-Burger adicionado · Ver carrinho",
// "Item removido · Desfazer". Um por vez; sem modal, sem confete (G8).
import { useCallback, useEffect, useRef, useState } from "react";

export type ToastAction = { label: string; onClick: () => void };

export type ToastState = { action?: ToastAction; id: number; message: string };

export function useToast(): {
  dismiss: () => void;
  show: (message: string, action?: ToastAction, durationMs?: number) => void;
  toast: ToastState | null;
} {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const show = useCallback((message: string, action?: ToastAction, durationMs = 4000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, ...(action ? { action } : {}) });
    timerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { dismiss, show, toast };
}

export function Toast({ onDismiss, toast }: { onDismiss: () => void; toast: ToastState | null }) {
  return (
    <div aria-live="polite" className="foode-toast-region" role="status">
      {toast ? (
        <div className="foode-toast" key={toast.id}>
          <p className="min-w-0 flex-1 text-sm font-bold text-[var(--color-ink)]">
            {toast.message}
          </p>
          {toast.action ? (
            <button
              className="min-h-11 shrink-0 px-2 text-sm font-bold text-[var(--color-primary-strong)]"
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
              type="button"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
