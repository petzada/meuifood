"use client";

// "Copiar link" com feedback "Link copiado" por 2 s em `aria-live` (LNK-01).
import { Button } from "@foode/ui";
import { useEffect, useState } from "react";

export function CopyLinkButton({
  label = "Copiar link",
  url,
  variant = "primary",
}: {
  label?: string;
  url: string;
  variant?: "primary" | "secondary";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button onClick={() => void copy()} type="button" variant={variant}>
        {label}
      </Button>
      <span aria-live="polite" className="text-sm font-bold text-[var(--color-primary-strong)]">
        {state === "copied" ? "Link copiado" : state === "failed" ? "Não foi possível copiar." : ""}
      </span>
    </span>
  );
}
