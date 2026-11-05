"use client";

// Aviso de resultado vindo da URL (`?aviso=...` depois de criar/salvar e redirecionar) como
// Toast (decisão 72): dispara uma vez ao montar e não ocupa espaço na página.
import { type ToastTone, useToast } from "@foode/ui";
import { useEffect, useRef } from "react";

export function ToastNotice({ message, tone = "success" }: { message: string; tone?: ToastTone }) {
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.show(message, { tone });
  }, [message, tone, toast]);
  return null;
}
