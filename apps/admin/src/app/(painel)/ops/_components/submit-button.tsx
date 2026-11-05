"use client";

import { Button } from "@foode/ui";
import type { ReactNode } from "react";

import { useFormPending } from "../../../../components/action-form";

/** Botão de envio com estado pendente; `disabled` extra para edição sem mudança (T-06). */
export function SubmitButton({
  children,
  className,
  disabled = false,
  onClick,
  pendingLabel = "Aguarde...",
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const pending = useFormPending();
  return (
    <Button
      {...(className ? { className } : {})}
      {...(onClick ? { onClick } : {})}
      disabled={pending || disabled}
      type="submit"
      variant={variant}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
