"use client";

// Formulário de edição (T-06): "Salvar alterações" só com mudança, e aviso ao sair com
// mudança pendente. Compara o FormData serializado com a foto tirada ao montar (e refeita
// depois de salvar).
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

function snapshot(form: HTMLFormElement | null): string {
  if (!form) return "";
  const entries: string[] = [];
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") entries.push(`${key}=${value}`);
  }
  return entries.sort().join("&");
}

export function useDirtyForm(resetKey: unknown): {
  dirty: boolean;
  onChange: () => void;
  ref: RefObject<HTMLFormElement | null>;
} {
  const ref = useRef<HTMLFormElement>(null);
  const baseline = useRef<string>("");
  const [dirty, setDirty] = useState(false);

  // Nova foto ao montar e sempre que `resetKey` mudar (depois de salvar com sucesso).
  useEffect(() => {
    baseline.current = snapshot(ref.current);
    setDirty(false);
  }, [resetKey]);

  const onChange = useCallback(() => {
    setDirty(snapshot(ref.current) !== baseline.current);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { dirty, onChange, ref };
}
