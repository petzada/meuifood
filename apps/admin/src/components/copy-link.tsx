"use client";

// "Copiar link" com feedback "Link copiado" no Toast padrão (LNK-01, decisão 72).
import { Button, useToast } from "@foode/ui";

export function CopyLinkButton({
  label = "Copiar link",
  url,
  variant = "primary",
}: {
  label?: string;
  url: string;
  variant?: "primary" | "secondary";
}) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <Button onClick={() => void copy()} type="button" variant={variant}>
      {label}
    </Button>
  );
}
