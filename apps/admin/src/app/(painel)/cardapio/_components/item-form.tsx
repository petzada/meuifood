"use client";

// Dados do item (etapa/aba "Dados" do cadastro em modal, decisão 74): nome, preço em R$,
// descrição com contador, categoria (com "+ Nova categoria" no cadastro), foto, disponibilidade e
// Destaque com o aviso do teto (P-5.5).
// - `variant="wizard"` (cadastro): "Continuar" sempre habilitado, valida no envio (T-06); depois
//   de criado (`draftItemId`), Continuar sem mudança só avança e com mudança salva antes.
// - `variant="tab"` (edição): "Salvar alterações" só com mudança (T-06).
import type { AdminMenuCategory, AdminMenuItem } from "@foode/shared/menu";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ActionForm } from "../../../../components/action-form";
import { CadastroFooter } from "../../../../components/cadastro-modal";
import { Field } from "../../../../components/form";
import type { UploadResult } from "../../../../lib/menu-forms";
import { featuredFull, featuredHint, NEW_CATEGORY } from "../../../../lib/menu-labels";
import { centsToInput } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, SelectField, TextareaField } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import type { CreatedState, MenuAction } from "../actions";
import { ImageField } from "./image-field";

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
  draftItemId = null,
  extraActions,
  featuredCount,
  item,
  onDirtyChange,
  onSaved,
  upload,
  variant = "tab",
}: {
  action: MenuAction;
  categories: Pick<AdminMenuCategory, "id" | "name">[];
  /** Categoria inicial (a aberta no Cardápio) ou a atual do item. */
  categoryId: string | null;
  /** Item já criado por esta etapa (Voltar no cadastro): o envio passa a salvar alterações. */
  draftItemId?: string | null;
  /** Ações à esquerda do envio no rodapé (ex.: Apagar item). */
  extraActions?: ReactNode;
  featuredCount: number;
  /** Ausente = criação. */
  item: AdminMenuItem | null;
  onDirtyChange?: (dirty: boolean) => void;
  /** Depois de salvar (ou de "Continuar" sem mudança num item já criado). */
  onSaved?: (state: CreatedState) => void;
  upload: (formData: FormData) => Promise<UploadResult>;
  variant?: "tab" | "wizard";
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, IDLE_FORM);
  // A foto só é refeita depois de salvar com sucesso (erro mantém o que foi digitado como mudança).
  const { dirty, onChange, ref } = useDirtyForm(state.status === "success" ? state : null);
  const id = useId();
  const [descriptionLength, setDescriptionLength] = useState(item?.description.length ?? 0);
  const savedId = item?.id ?? draftItemId;
  const editing = savedId !== null;
  const wizard = variant === "wizard";
  const full = featuredFull(featuredCount, item?.featured ?? false);
  const noCategories = categories.length === 0;
  const [category, setCategory] = useState<string>(categoryId ?? categories[0]?.id ?? NEW_CATEGORY);
  const newCategory = !editing && (noCategories || category === NEW_CATEGORY);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const reported = useRef<FormState | null>(null);
  useEffect(() => {
    if (state.status !== "success" || reported.current === state) return;
    reported.current = state;
    const saved = state as CreatedState;
    // Categoria criada junto com o item: o seletor passa a apontar para ela.
    if (saved.categoryId) setCategory(saved.categoryId);
    onSaved?.(saved);
  }, [onSaved, state]);

  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      resetOnSuccess={false}
      onSubmit={(event) => {
        // Etapa já salva e sem mudança: "Continuar" só avança (nada a enviar).
        if (wizard && editing && !dirty) {
          event.preventDefault();
          onSaved?.({ ...IDLE_FORM, status: "success", ...(savedId ? { itemId: savedId } : {}) });
        }
      }}
      className="space-y-6"
    >
      {editing ? <input type="hidden" name="itemId" value={savedId ?? ""} /> : null}

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
        rows={3}
        onChange={(event) => setDescriptionLength(event.currentTarget.value.length)}
        error={state.errors.description}
        hint={`${descriptionLength} de ${DESCRIPTION_MAX} caracteres.`}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {noCategories && !editing ? (
          <input type="hidden" name="categoryId" value={NEW_CATEGORY} />
        ) : (
          <SelectField
            id={`${id}-category`}
            name="categoryId"
            label="Categoria"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            error={state.errors.categoryId}
            hint={
              editing
                ? "Mudar de categoria leva o item para o fim da lista da nova categoria."
                : "O item entra no fim da categoria."
            }
          >
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            {!editing ? <option value={NEW_CATEGORY}>+ Nova categoria</option> : null}
          </SelectField>
        )}
        {newCategory ? (
          <Field
            id={`${id}-new-category`}
            name="newCategoryName"
            label={noCategories ? "Categoria do item" : "Nome da nova categoria"}
            placeholder="Ex.: Lanches"
            maxLength={120}
            autoComplete="off"
            error={state.errors.newCategoryName}
            hint="A categoria é criada junto com o item."
          />
        ) : null}
      </div>

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

      {/* No cadastro, o Toast de sucesso vem só no fim (ao concluir as etapas). */}
      <ActionNotice state={wizard && state.status === "success" ? IDLE_FORM : state} />
      <CadastroFooter>
        {extraActions ? <div className="mr-auto">{extraActions}</div> : null}
        {!wizard && !dirty ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
        ) : null}
        <SubmitButton
          disabled={!wizard && !dirty}
          pendingLabel={editing ? "Salvando..." : "Criando..."}
        >
          {wizard ? "Continuar" : "Salvar alterações"}
        </SubmitButton>
      </CadastroFooter>
    </ActionForm>
  );
}
