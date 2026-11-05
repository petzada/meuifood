// Primitivos de formulário do Painel (marca Foode: borda fina, sem shadow, primary só no
// foco e no CTA). Servem às telas de auth e aos próximos tickets.
import type { InputHTMLAttributes, ReactNode } from "react";

const INPUT_CLASSES =
  "mt-2 block min-h-12 w-full rounded-xl border bg-transparent px-4 text-base font-normal text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]";

export function Field({
  error,
  hint,
  id,
  label,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  error?: string | undefined;
  hint?: string | undefined;
  id: string;
  label: string;
}) {
  const describedBy = [error ? `${id}-erro` : null, hint ? `${id}-dica` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[var(--color-ink)]">
        {label}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${INPUT_CLASSES} ${error ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
          {...input}
        />
      </label>
      {hint ? (
        <p id={`${id}-dica`} className="mt-1.5 text-sm text-[var(--color-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-erro`} className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "success";
}) {
  const color =
    tone === "error"
      ? "border-[var(--color-error)] text-[var(--color-error)]"
      : tone === "success"
        ? "border-[var(--color-primary)] text-[var(--color-primary-active)]"
        : "border-[var(--color-hairline)] text-[var(--color-body)]";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm font-bold ${color}`}
    >
      {children}
    </p>
  );
}
