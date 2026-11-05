// Primitivos de formulário da área Ops, no mesmo desenho de `components/form.tsx`
// (borda fina, primary só no foco e no CTA). Select, textarea, aviso de estado da action e
// cabeçalho de seção. `ActionNotice` lê o contexto do `ActionForm` (Client Component).
import type { ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Aviso de resultado da action: virou Toast (decisão 72); re-exportado para os imports antigos.
export { ActionNotice } from "../../../../components/action-form";

const CONTROL_CLASSES =
  "mt-2 block min-h-12 w-full rounded-xl border bg-transparent px-4 text-base font-normal text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]";

function describedBy(id: string, error?: string, hint?: string) {
  return (
    [error ? `${id}-erro` : null, hint ? `${id}-dica` : null].filter(Boolean).join(" ") || undefined
  );
}

function Messages({
  error,
  hint,
  id,
}: {
  error?: string | undefined;
  hint?: string | undefined;
  id: string;
}) {
  return (
    <>
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
    </>
  );
}

export function SelectField({
  children,
  error,
  hint,
  id,
  label,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  id: string;
  label: string;
  ref?: Ref<HTMLSelectElement>;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[var(--color-ink)]">
        {label}
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${CONTROL_CLASSES} ${error ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
          {...select}
        >
          {children}
        </select>
      </label>
      <Messages error={error} hint={hint} id={id} />
    </div>
  );
}

export function TextareaField({
  error,
  hint,
  id,
  label,
  ...textarea
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string | undefined;
  hint?: string | undefined;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[var(--color-ink)]">
        {label}
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${CONTROL_CLASSES} min-h-28 py-3 leading-relaxed ${error ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
          {...textarea}
        />
      </label>
      <Messages error={error} hint={hint} id={id} />
    </div>
  );
}

/** Cabeçalho de seção (T-07: seções independentes, sem numeração). */
export function SectionHeading({
  children,
  description,
  id,
}: {
  children: ReactNode;
  description?: ReactNode;
  id: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
        {children}
      </h2>
      {description ? (
        <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-[var(--color-body)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Lista "rótulo: valor" compacta para leitura. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-[var(--color-ink)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Estado vazio de uma tela de dados (T-04): diz o que é e o próximo passo. */
export function EmptyState({ children, title }: { children?: ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-hairline)] px-5 py-8 text-center">
      <p className="font-bold text-[var(--color-ink)]">{title}</p>
      {children ? <div className="mt-2 text-sm text-[var(--color-body)]">{children}</div> : null}
    </div>
  );
}
