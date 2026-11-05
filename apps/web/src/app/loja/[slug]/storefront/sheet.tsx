"use client";

// Sheet acessível sobre `<dialog>` nativo: foco preso, Esc fecha e o foco volta ao gatilho
// (G6). No celular sobe do rodapé; em telas largas centraliza. Outline, sem sombra (ADR 0005).
import { X } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

export type SheetProps = {
  children: ReactNode;
  /** Rodapé fixo (CTA único da tela, G1). */
  footer?: ReactNode;
  labelledBy: string;
  onClose: () => void;
  open: boolean;
  /** Título visual do topo; quando ausente, o conteúdo traz o próprio `h2`. */
  title?: ReactNode;
  wide?: boolean;
};

export function Sheet({ children, footer, labelledBy, onClose, open, title, wide }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby={labelledBy}
      className={["foode-sheet", wide && "foode-sheet--wide"].filter(Boolean).join(" ")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Toque no backdrop fecha; o painel interno não propaga.
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <div className="foode-sheet__panel">
        <div className="foode-sheet__head">
          {title ? (
            <h2 className="text-lg font-bold text-[var(--color-ink)]" id={labelledBy}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button aria-label="Fechar" className="foode-icon-button" onClick={onClose} type="button">
            <X aria-hidden size={20} weight="bold" />
          </button>
        </div>
        <div className="foode-sheet__body">{children}</div>
        {footer ? <div className="foode-sheet__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}
