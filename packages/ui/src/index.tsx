import { createElement, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type SharedButtonProps = {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
};

type ButtonLinkProps = SharedButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonActionProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

export type ButtonProps = ButtonLinkProps | ButtonActionProps;

export function Button(props: ButtonProps) {
  const { children, className, variant = "primary", ...elementProps } = props;
  const classes = ["foode-button", `foode-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  if ("href" in elementProps && typeof elementProps.href === "string") {
    return (
      <a {...elementProps} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button {...elementProps} className={classes} type={elementProps.type ?? "button"}>
      {children}
    </button>
  );
}

export type OutlineContainerProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
  children: ReactNode;
};

export function OutlineContainer({
  as = "div",
  children,
  className,
  ...props
}: OutlineContainerProps) {
  const classes = ["foode-outline", className].filter(Boolean).join(" ");
  return createElement(as, { ...props, className: classes }, children);
}
