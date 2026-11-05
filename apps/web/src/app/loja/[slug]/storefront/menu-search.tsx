"use client";

// Busca no Cardápio (C4, P-1.4): rótulo visível, filtro no navegador com debounce curto,
// "Limpar busca" e contagem anunciada em `aria-live`. O filtro em si é `searchMenu`.
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";

export const SEARCH_DEBOUNCE_MS = 150;

export function MenuSearch({
  onChange,
  resultCount,
  value,
}: {
  onChange: (query: string) => void;
  /** `null` quando a busca não está ativa (consulta curta ou vazia). */
  resultCount: number | null;
  value: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, onChange, value]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 md:px-8">
      <label className="text-sm font-bold text-[var(--color-ink)]" htmlFor={id}>
        Buscar no Cardápio
      </label>
      <div className="relative mt-1.5">
        <MagnifyingGlass
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
          size={18}
          weight="bold"
        />
        <input
          autoComplete="off"
          className="foode-control foode-search-input"
          enterKeyHint="search"
          id={id}
          inputMode="search"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ex.: pizza, suco"
          type="search"
          value={draft}
        />
        {draft ? (
          <button
            aria-label="Limpar busca"
            className="foode-icon-button absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
            type="button"
          >
            <X aria-hidden size={18} weight="bold" />
          </button>
        ) : null}
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-5 text-sm text-[var(--color-muted)]">
        {resultCount === null
          ? ""
          : resultCount === 1
            ? "1 item encontrado"
            : `${resultCount} itens encontrados`}
      </p>
    </div>
  );
}
