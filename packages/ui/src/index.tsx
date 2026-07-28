import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { createElement, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type SharedButtonProps = {
  asChild?: boolean;
  children: ReactNode;
  className?: string;
} & VariantProps<typeof buttonVariants>;

const buttonVariants = cva("foode-button", {
  variants: {
    variant: {
      primary: "foode-button--primary",
      secondary: "foode-button--secondary",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

type ButtonLinkProps = SharedButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonActionProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

export type ButtonProps = ButtonLinkProps | ButtonActionProps;

export function Button(props: ButtonProps) {
  const { asChild, children, className, variant, ...elementProps } = props;
  const classes = buttonVariants({ className, variant });

  if (asChild) {
    return (
      <Slot {...elementProps} className={classes}>
        {children}
      </Slot>
    );
  }

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

export type BrandMarkProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  size?: "compact" | "default";
};

export function BrandMark({ children, className, size = "default", ...props }: BrandMarkProps) {
  const classes = ["foode-brand-mark", `foode-brand-mark--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span {...props} className={classes}>
      {children}
    </span>
  );
}
