"use client";

// Painel de categorias (CAR-01, esquerda no desktop): lista ordenável por botões, categoria
// atual marcada, selo "Esgotado" por texto (T-03) e "+ Nova categoria" sempre habilitado
// (formulário de criação valida no envio, T-06).
import { Badge } from "@foode/ui";
import type { AdminMenuCategory } from "@foode/shared/menu";
import Link from "next/link";
import { useActionState, useId } from "react";

import { Field } from "../../../../components/form";
import { pluralize } from "../../../../lib/menu-labels";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import type { MenuAction } from "../actions";
import { ReorderButtons } from "./quick-actions";
import { ActionForm } from "../../../../components/action-form";

export function NewCategoryForm({
  action,
  autoFocus = false,
  label = "Nova categoria",
}: {
  action: MenuAction;
  autoFocus?: boolean;
  label?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const id = useId();
  return (
    <ActionForm action={formAction} state={state} className="space-y-3">
      <Field
        id={`${id}-name`}
        name="name"
        label={label}
        placeholder="Ex.: Lanches"
        maxLength={120}
        autoComplete="off"
        autoFocus={autoFocus}
        error={state.errors.name}
      />
      <ActionNotice state={state} />
      <SubmitButton className="w-full" pendingLabel="Criando...">
        Criar categoria
      </SubmitButton>
    </ActionForm>
  );
}

export function CategoryPanel({
  categories,
  createCategory,
  reorderCategories,
  selectedId,
}: {
  categories: AdminMenuCategory[];
  createCategory: MenuAction;
  reorderCategories: MenuAction;
  selectedId: string;
}) {
  const ids = categories.map((category) => category.id);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <h2
        id={headingId}
        className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]"
      >
        Categorias · {categories.length}
      </h2>
      <ol className="space-y-2">
        {categories.map((category) => {
          const current = category.id === selectedId;
          return (
            <li
              key={category.id}
              className={`flex items-center gap-2 rounded-2xl border pl-4 pr-2 py-2 ${
                current ? "border-[var(--color-primary)]" : "border-[var(--color-hairline)]"
              }`}
            >
              <Link
                href={`/cardapio?categoria=${category.id}`}
                aria-current={current ? "page" : undefined}
                className="min-w-0 flex-1 py-1 outline-none focus-visible:underline"
              >
                <span
                  className={`block truncate font-bold ${current ? "text-[var(--color-primary-strong)]" : "text-[var(--color-ink)]"}`}
                >
                  {category.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                  {pluralize(category.items.length, "item", "itens")}
                  {!category.available ? <Badge tone="error">Esgotado</Badge> : null}
                </span>
              </Link>
              <ReorderButtons
                action={reorderCategories}
                id={category.id}
                ids={ids}
                label={category.name}
              />
            </li>
          );
        })}
      </ol>
      <div className="border-t border-[var(--color-hairline-soft)] pt-5">
        <NewCategoryForm action={createCategory} />
      </div>
    </section>
  );
}
