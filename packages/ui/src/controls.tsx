// Controles de formulário da marca (Ticket 18.3 → 23): o input que estava copiado 33 vezes
// vira um módulo. Outline fino, sem shadow, foco visível em primary-soft, Nunito via canvas.
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type FieldProps = {
  children: ReactNode;
  className?: string;
  /** Mensagem de erro; quando presente, o controle recebe `aria-invalid` e `aria-describedby`. */
  error?: string;
  hint?: string;
  /** `id` do controle filho; sem ele o Field gera um e o passa via render prop. */
  id?: string;
  label: ReactNode;
};

export type FieldRenderProps = {
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  id: string;
};

/**
 * Rótulo + controle + dica/erro. Usa render prop para ligar `id`/`aria-*` ao controle:
 * `<Field label="Nome">{(a11y) => <Input {...a11y} name="name" />}</Field>`.
 */
export function Field({
  children,
  className,
  error,
  hint,
  id: explicitId,
  label,
}: Omit<FieldProps, "children"> & {
  children: ReactNode | ((a11y: FieldRenderProps) => ReactNode);
}) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const a11y: FieldRenderProps = {
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    id,
  };

  return (
    <div className={cx("foode-field", error && "foode-field--error", className)}>
      <label className="foode-field__label" htmlFor={id}>
        {label}
      </label>
      {typeof children === "function" ? children(a11y) : children}
      {hint ? (
        <p className="foode-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="foode-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={props["aria-invalid"] ?? (invalid ? true : undefined)}
      className={cx("foode-control", "foode-input", className)}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={props["aria-invalid"] ?? (invalid ? true : undefined)}
      className={cx("foode-control", "foode-textarea", className)}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export function Select({ children, className, invalid, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={props["aria-invalid"] ?? (invalid ? true : undefined)}
      className={cx("foode-control", "foode-select", className)}
    >
      {children}
    </select>
  );
}

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Texto ao lado do controle (opção do Complemento, Adicional...). */
  children: ReactNode;
  /** Conteúdo à direita, como o preço do Adicional. */
  trailing?: ReactNode;
};

function Choice({
  children,
  className,
  kind,
  trailing,
  ...props
}: ChoiceProps & { kind: "checkbox" | "radio" }) {
  return (
    <label
      className={cx(
        "foode-choice",
        `foode-choice--${kind}`,
        props.disabled && "foode-choice--disabled",
        className,
      )}
    >
      <input {...props} className="foode-choice__input" type={kind} />
      <span className="foode-choice__label">{children}</span>
      {trailing !== undefined ? <span className="foode-choice__trailing">{trailing}</span> : null}
    </label>
  );
}

/** Opção de múltipla escolha (grupo com `maxSelect > 1`, Adicionais). */
export function Checkbox(props: ChoiceProps) {
  return <Choice {...props} kind="checkbox" />;
}

/** Opção de escolha única (grupo com `maxSelect === 1`). */
export function Radio(props: ChoiceProps) {
  return <Choice {...props} kind="radio" />;
}
