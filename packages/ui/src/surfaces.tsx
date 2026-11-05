// Superfícies e sinais da marca: Card outline (ADR 0005: borda fina, sem fill, sem shadow),
// Badge discreto e Price em centavos.
import { createElement, type HTMLAttributes, type ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "li" | "section";
  children: ReactNode;
  /** Densidade interna: `compact` em listas (item do Cardápio), `default` em painéis. */
  padding?: "compact" | "default" | "none";
  /** Destaque de seleção/foco de conteúdo (borda primary), sem fill. */
  selected?: boolean;
};

/** Container outline com padding; `OutlineContainer` continua sendo a versão sem padding. */
export function Card({
  as = "div",
  children,
  className,
  padding = "default",
  selected,
  ...props
}: CardProps) {
  return createElement(
    as,
    {
      ...props,
      className: cx(
        "foode-outline",
        "foode-card",
        `foode-card--${padding}`,
        selected && "foode-card--selected",
        className,
      ),
    },
    children,
  );
}

export type BadgeTone = "accent" | "error" | "neutral" | "primary" | "success";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
};

/** Sinal curto (status do Pedido, "Indisponível", "Obrigatório"). Accent é raro, por regra da marca. */
export function Badge({ children, className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span {...props} className={cx("foode-badge", `foode-badge--${tone}`, className)}>
      {children}
    </span>
  );
}

const brl = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

/** Formatação padrão; o app pode injetar `formatBRL` de `@foode/shared/money` via `format`. */
export function formatCentsBRL(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Price: cents precisa ser inteiro (recebido ${cents})`);
  }
  return brl.format(cents / 100);
}

export type PriceProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  cents: number;
  /** Troca a formatação (ex.: `formatBRL` de `@foode/shared/money`). */
  format?: (cents: number) => string;
  /** Prefixo discreto, como "+" num Adicional ou "a partir de". */
  prefix?: ReactNode;
  size?: "default" | "large" | "small";
  /** Preço riscado (valor cheio ao lado do promocional). */
  strike?: boolean;
};

/** Valor monetário semântico: `<data value="1250">R$ 12,50</data>`, sempre em centavos. */
export function Price({
  cents,
  className,
  format = formatCentsBRL,
  prefix,
  size = "default",
  strike,
  ...props
}: PriceProps) {
  return (
    <data
      {...props}
      className={cx(
        "foode-price",
        `foode-price--${size}`,
        strike && "foode-price--strike",
        className,
      )}
      value={String(cents)}
    >
      {prefix !== undefined ? <span className="foode-price__prefix">{prefix}</span> : null}
      {format(cents)}
    </data>
  );
}
