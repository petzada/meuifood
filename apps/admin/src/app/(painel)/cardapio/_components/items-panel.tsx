"use client";

// Itens da categoria escolhida (CAR-01, direita no desktop): cabeçalho com renomear,
// disponibilidade da categoria (CAR-02) e apagar com confirmação (T-12); linhas com foto,
// Destaque/Esgotado por texto, preço inline (CAR-03) e reordenar por botões (CAR-04).
import { Badge, Button } from "@foode/ui";

import { OpenCadastroButton } from "./cardapio-cadastros";
import type { AdminMenuCategory, AdminMenuItem } from "@foode/shared/menu";
import { useActionState, useId, useState } from "react";

import { Field } from "../../../../components/form";
import { pluralize } from "../../../../lib/menu-labels";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice, EmptyState } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import type { MenuAction } from "../actions";
import {
  AvailabilitySwitch,
  ConfirmDialogForm,
  InlinePrice,
  ReorderButtons,
} from "./quick-actions";
import { ActionForm } from "../../../../components/action-form";

export type ItemsPanelActions = {
  deleteCategory: MenuAction;
  renameCategory: MenuAction;
  reorderItems: MenuAction;
  setCategoryAvailable: MenuAction;
  setItemAvailable: MenuAction;
  setItemPrice: MenuAction;
};

function Thumbnail({ item }: { item: AdminMenuItem }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        className="size-16 shrink-0 rounded-xl border border-[var(--color-hairline)] object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--color-hairline)] text-xs font-bold text-[var(--color-muted)]"
    >
      sem foto
    </span>
  );
}

function RenameForm({
  action,
  category,
  onDone,
}: {
  action: MenuAction;
  category: AdminMenuCategory;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const id = useId();
  return (
    <ActionForm action={formAction} state={state} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="categoryId" value={category.id} />
      <div className="min-w-[16rem] flex-1">
        <Field
          id={`${id}-name`}
          name="name"
          label="Nome da categoria"
          defaultValue={category.name}
          maxLength={120}
          autoFocus
          error={state.errors.name}
        />
      </div>
      <SubmitButton pendingLabel="Salvando...">Salvar nome</SubmitButton>
      <Button variant="secondary" type="button" onClick={onDone}>
        Cancelar
      </Button>
      <div className="basis-full">
        <ActionNotice state={state} />
      </div>
    </ActionForm>
  );
}

function ItemRow({
  actions,
  category,
  ids,
  item,
}: {
  actions: ItemsPanelActions;
  category: AdminMenuCategory;
  ids: string[];
  item: AdminMenuItem;
}) {
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-[var(--color-hairline)] p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Thumbnail item={item} />
        <div className="min-w-0 flex-1">
          <OpenCadastroButton
            modal={{ kind: "edit-item", itemId: item.id }}
            variant="link"
            className="block max-w-full truncate"
          >
            {item.name}
          </OpenCadastroButton>
          {item.description ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-[var(--color-body)]">
              {item.description}
            </p>
          ) : null}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
            {item.featured ? <Badge tone="accent">Destaque</Badge> : null}
            {!item.available ? <Badge tone="error">Esgotado</Badge> : null}
            {item.complementGroups.length > 0 ? (
              <span>{pluralize(item.complementGroups.length, "grupo", "grupos")}</span>
            ) : null}
            {item.additionals.length > 0 ? (
              <span>{pluralize(item.additionals.length, "Adicional", "Adicionais")}</span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3 md:justify-end">
        <InlinePrice
          action={actions.setItemPrice}
          itemId={item.id}
          label={item.name}
          priceCents={item.priceCents}
        />
        <AvailabilitySwitch
          action={actions.setItemAvailable}
          available={item.available}
          id={item.id}
          idName="itemId"
          label={item.name}
        />
        <ReorderButtons
          action={actions.reorderItems}
          hidden={{ categoryId: category.id }}
          id={item.id}
          ids={ids}
          label={item.name}
        />
        <OpenCadastroButton
          modal={{ kind: "edit-item", itemId: item.id }}
          variant="secondary"
          className="min-h-11 px-4 py-2 text-sm"
          aria-label={`Editar ${item.name}`}
        >
          Editar
        </OpenCadastroButton>
      </div>
    </li>
  );
}

export function ItemsPanel({
  actions,
  category,
}: {
  actions: ItemsPanelActions;
  category: AdminMenuCategory;
}) {
  const [renaming, setRenaming] = useState(false);
  const headingId = useId();
  const ids = category.items.map((item) => item.id);
  const hasItems = category.items.length > 0;

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <header className="flex flex-col gap-4">
        {renaming ? (
          <RenameForm
            action={actions.renameCategory}
            category={category}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2
                id={headingId}
                className="truncate text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
              >
                {category.name}
              </h2>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--color-primary-strong)] underline-offset-4 hover:underline focus-visible:underline"
              >
                Renomear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AvailabilitySwitch
                action={actions.setCategoryAvailable}
                available={category.available}
                id={category.id}
                idName="categoryId"
                label={`Categoria ${category.name}`}
              />
            </div>
          </div>
        )}
        {!category.available ? (
          <p role="status" className="text-sm text-[var(--color-body)]">
            Categoria esgotada: nenhum item dela aparece no Storefront até voltar a{" "}
            <strong>Disponível</strong>.
          </p>
        ) : null}
      </header>

      {hasItems ? (
        <ol className="space-y-3">
          {category.items.map((item) => (
            <ItemRow key={item.id} actions={actions} category={category} ids={ids} item={item} />
          ))}
        </ol>
      ) : (
        <EmptyState title="Nenhum item nesta categoria.">
          <p>
            Use <strong>Adicionar item</strong> no topo da página: nome, preço e foto primeiro;
            Complementos e Adicionais nas etapas seguintes.
          </p>
        </EmptyState>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--color-hairline-soft)] pt-5">
        <p className="text-xs text-[var(--color-muted)]">
          Preço: digite e tecle Enter (ou ✓) para salvar; Esc desfaz.
        </p>
        <ConfirmDialogForm
          action={actions.deleteCategory}
          confirmLabel="Apagar categoria"
          description={
            <p>
              A categoria <strong>{category.name}</strong> sai do Cardápio. Só categorias sem itens
              podem ser apagadas.
            </p>
          }
          hidden={{ categoryId: category.id }}
          title={`Apagar ${category.name}?`}
          trigger="Apagar categoria"
          triggerDisabled={hasItems}
          triggerHint={
            hasItems ? "Mova ou apague os itens antes de apagar a categoria." : undefined
          }
        />
      </div>
    </section>
  );
}
