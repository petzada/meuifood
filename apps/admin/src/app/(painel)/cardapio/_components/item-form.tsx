"use client";

// Dados do item (CAR-05, seção "Dados"): nome, descrição com contador, preço em R$, foto,
// categoria (edição: mover), disponibilidade e Destaque com o aviso do teto (P-5.5).
// Criação: botão sempre habilitado, valida no envio. Edição: "Salvar alterações" só com
// mudança e aviso ao sair (T-06).
import type { AdminMenuCategory, AdminMenuItem } from "@foode/shared/menu";
import { useActionState, useId, useState } from "react";

import { Field } from "../../../../components/form";
import type { UploadResult } from "../../../../lib/menu-forms";
import { featuredFull, featuredHint } from "../../../../lib/menu-labels";
import { centsToInput } from "../../../../lib/ops-format";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import { ActionNotice, SelectField, TextareaField } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import type { MenuAction } from "../actions";
import { ImageField } from "./image-field";
import { ActionForm } from "../../../../components/action-form";

const DESCRIPTION_MAX = 600;

function Toggle({
  defaultChecked,
  disabled,
  hint,
  id,
  label,
  name,
  onChange,
}: {
  defaultChecked: boolean;
  disabled?: boolean;
  hint: string;
  id: string;
  label: string;
  name: string;
  onChange?: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex min-h-12 items-start gap-3 rounded-xl border border-[var(--color-hairline)] px-4 py-3 ${disabled ? "opacity-70" : "cursor-pointer"}`}
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-describedby={`${id}-dica`}
        onChange={onChange}
        className="mt-1 size-4.5 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--color-ink)]">{label}</span>
        <span id={`${id}-dica`} className="block text-sm text-[var(--color-body)]">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function ItemForm({
  action,
  categories,
  categoryId,
  featuredCount,
  item,
  upload,
}: {
  action: MenuAction;
  categories: Pick<AdminMenuCategory, "id" | "name">[];
  /** Categoria da criação (vem da URL) ou atual do item. */
  categoryId: string;
  featuredCount: number;
  /** Ausente = criação. */
  item: AdminMenuItem | null;
  upload: (formData: FormData) => Promise<UploadResult>;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  // A foto só é refeita depois de salvar com sucesso (erro mantém o que foi digitado como mudança).
  const { dirty, onChange, ref } = useDirtyForm(state.status === "success" ? state : null);
  const id = useId();
  const [descriptionLength, setDescriptionLength] = useState(item?.description.length ?? 0);
  const editing = item !== null;
  const full = featuredFull(featuredCount, item?.featured ?? false);

  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      className="space-y-6"
    >
      {editing ? <input type="hidden" name="itemId" value={item.id} /> : null}
      {!editing ? <input type="hidden" name="categoryId" value={categoryId} /> : null}

      <div className="grid gap-5 md:grid-cols-[1fr_12rem]">
        <Field
          id={`${id}-name`}
          name="name"
          label="Nome do item"
          defaultValue={item?.name ?? ""}
          placeholder="Ex.: Misto Quente"
          maxLength={120}
          autoComplete="off"
          autoFocus={!editing}
          error={state.errors.name}
        />
        <Field
          id={`${id}-price`}
          name="priceCents"
          label="Preço (R$)"
          defaultValue={item ? centsToInput(item.priceCents) : ""}
          placeholder="R$ 12,90"
          inputMode="numeric"
          data-money=""
          autoComplete="off"
          error={state.errors.priceCents}
        />
      </div>

      <TextareaField
        id={`${id}-description`}
        name="description"
        label="Descrição"
        defaultValue={item?.description ?? ""}
        placeholder="Ingredientes, tamanho, o que vem junto."
        maxLength={DESCRIPTION_MAX}
        onChange={(event) => setDescriptionLength(event.currentTarget.value.length)}
        error={state.errors.description}
        hint={`${descriptionLength} de ${DESCRIPTION_MAX} caracteres.`}
      />

      {editing && categories.length > 1 ? (
        <SelectField
          id={`${id}-category`}
          name="categoryId"
          label="Categoria"
          defaultValue={categoryId}
          error={state.errors.categoryId}
          hint="Mudar de categoria leva o item para o fim da lista da nova categoria."
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <ImageField
        initialKey={item?.imageObjectKey ?? null}
        initialUrl={item?.imageUrl ?? null}
        onChange={onChange}
        upload={upload}
      />
      {state.errors.imageObjectKey ? (
        <p role="alert" className="-mt-4 text-sm font-bold text-[var(--color-error)]">
          {state.errors.imageObjectKey}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Toggle
          id={`${id}-available`}
          name="available"
          label="Disponível"
          hint="Desmarcado = Esgotado: o item aparece no Storefront, mas sem compra."
          defaultChecked={item?.available ?? true}
        />
        <div>
          <Toggle
            id={`${id}-featured`}
            name="featured"
            label="Destaque"
            hint={featuredHint(featuredCount, item?.featured ?? false)}
            defaultChecked={item?.featured ?? false}
            disabled={full && !(item?.featured ?? false)}
          />
          {state.errors.featured ? (
            <p role="alert" className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
              {state.errors.featured}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <ActionNotice state={state} />
        {editing && !dirty && state.status !== "success" ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
        ) : null}
        <SubmitButton
          disabled={editing && !dirty}
          pendingLabel={editing ? "Salvando..." : "Criando..."}
        >
          {editing ? "Salvar alterações" : "Criar item"}
        </SubmitButton>
        {!editing ? (
          <p className="text-sm text-[var(--color-body)]">
            Depois de criar, você monta Complementos e Adicionais na página do item.
          </p>
        ) : null}
      </div>
    </ActionForm>
  );
}
