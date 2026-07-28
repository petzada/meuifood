"use client";

import { Button } from "@foode/ui";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...(className ? { className } : {})}
      disabled={pending}
      type="submit"
      variant={variant}
    >
      {pending ? "Aguarde..." : children}
    </Button>
  );
}
