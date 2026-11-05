"use client";

// Painel de categorias (CAR-01, esquerda no desktop): "Criar categoria" no topo (abre o cadastro
// em modal, decisão 74), lista ordenável por botões, categoria atual marcada e selo "Esgotado"
// por texto (T-03).
import { Badge } from "@foode/ui";
import type { AdminMenuCategory } from "@foode/shared/menu";
import Link from "next/link";
import { useId } from "react";

import { pluralize } from "../../../../lib/menu-labels";
import type { MenuAction } from "../actions";
import { OpenCadastroButton } from "./cardapio-cadastros";
import { ReorderButtons } from "./quick-actions";

export function CategoryPanel({
  categories,
  reorderCategories,
  selectedId,
}: {
  categories: AdminMenuCategory[];
  reorderCategories: MenuAction;
  selectedId: string | null;
}) {
  const ids = categories.map((category) => category.id);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]"
        >
          Categorias · {categories.length}
        </h2>
      </div>
      <OpenCadastroButton modal={{ kind: "new-category" }} variant="secondary" className="w-full">
        Criar categoria
      </OpenCadastroButton>
      {categories.length === 0 ? (
        <p className="text-sm text-[var(--color-body)]">
          Nenhuma categoria ainda. Ela também pode ser criada junto com o primeiro item.
        </p>
      ) : (
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
      )}
    </section>
  );
}
