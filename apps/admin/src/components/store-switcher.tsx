"use client";

// Seletor de Loja ativa (usuário com mais de uma membership). Troca pela server action
// `switchStore`, que chama `switchActiveStore` na api; o servidor confere a membership.
import type { ActiveStore } from "@foode/shared/auth";
import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

function Apply() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="foode-button foode-button--secondary min-h-10 px-4 py-2 text-sm"
    >
      {pending ? "Trocando..." : "Trocar"}
    </button>
  );
}

export function StoreSwitcher({
  action,
  activeStoreId,
  stores,
}: {
  action: (formData: FormData) => Promise<void>;
  activeStoreId: string | null;
  stores: ActiveStore[];
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex items-end gap-2">
      <label
        htmlFor={id}
        className="block min-w-0 flex-1 text-xs font-bold text-[var(--color-muted)]"
      >
        Loja ativa
        <select
          id={id}
          name="storeId"
          defaultValue={activeStoreId ?? ""}
          onChange={() => form.current?.requestSubmit()}
          className="mt-1 block min-h-10 w-full rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-sm font-bold text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        >
          {activeStoreId ? null : <option value="">Escolha uma Loja</option>}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <Apply />
    </form>
  );
}
