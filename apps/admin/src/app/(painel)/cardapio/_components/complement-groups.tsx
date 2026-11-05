"use client";

// Complementos do item (CAR-05/CAR-06): cada grupo é um formulário próprio com nome, Mínimo e
// Máximo em steppers, selo "Obrigatório"/"Opcional" em tempo real (mínimo 0 = opcional, como o
// Consumidor verá), frase-resumo e opções com preço opcional (P-1.1). "Copiar grupos de outro
// item" (P-CAR-1) traz grupos com ids novos. Edição salva só com mudança (T-06).
import { Badge, Button } from "@foode/ui";
import type { AdminComplementGroup, AdminMenuItem } from "@foode/shared/menu";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Field } from "../../../../components/form";
import { MAX_COMPLEMENT_OPTIONS } from "../../../../lib/menu-forms";
import { pluralize, selectionSummary } from "../../../../lib/menu-labels";
import { centsToInput } from "../../../../lib/ops-format";
import { IDLE_FORM } from "../../../../lib/ops-forms";
import {
  ActionNotice,
  EmptyState,
  SectionHeading,
  SelectField,
} from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import type { MenuAction } from "../actions";
import { ConfirmDialogForm, ReorderButtons } from "./quick-actions";
import { ActionForm } from "../../../../components/action-form";

export type ComplementActions = {
  copyComplementGroups: MenuAction;
  createComplementGroup: MenuAction;
  deleteComplementGroup: MenuAction;
  reorderComplementGroups: MenuAction;
  updateComplementGroup: MenuAction;
};

/** Outros itens da Loja (para copiar grupos), com o nome da categoria para o seletor. */
export type CopySource = Pick<AdminMenuItem, "id" | "name" | "complementGroups"> & {
  categoryName: string;
};

const LIMIT_HELP =
  "O limite vale também para opções pagas. Para extras pagos sem limite (ex.: Molho extra), cadastre como Adicional.";

type OptionRow = { id: string | null; key: number; name: string; price: string };

function rowsFrom(group: AdminComplementGroup | null): OptionRow[] {
  if (!group) return [{ id: null, key: 0, name: "", price: "" }];
  return group.options.map((option, key) => ({
    id: option.id,
    key,
    name: option.name,
    price: option.priceCents > 0 ? centsToInput(option.priceCents) : "",
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function Stepper({
  error,
  id,
  label,
  max,
  min,
  name,
  onChange,
  value,
}: {
  error?: string | undefined;
  id: string;
  label: string;
  max: number;
  min: number;
  name: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const buttonClass =
    "inline-flex size-11 items-center justify-center rounded-full border border-[var(--color-hairline)] text-lg font-bold text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:opacity-40";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[var(--color-ink)]">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1, min, max))}
          className={buttonClass}
        >
          −
        </button>
        <input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.currentTarget.value), min, max))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-erro` : undefined}
          className={`min-h-11 w-16 rounded-xl border bg-transparent text-center text-base font-bold tabular-nums text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)] ${error ? "border-[var(--color-error)]" : "border-[var(--color-hairline)]"}`}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1, min, max))}
          className={buttonClass}
        >
          +
        </button>
      </div>
      {error ? (
        <p id={`${id}-erro`} className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Formulário de um grupo: criação (`group` nulo) ou edição. */
function GroupForm({
  action,
  group,
  itemId,
  onCancel,
}: {
  action: MenuAction;
  group: AdminComplementGroup | null;
  itemId: string;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const { dirty, onChange, ref } = useDirtyForm(state.status === "success" ? state : null);
  const id = useId();
  const editing = group !== null;
  const [minSelect, setMinSelect] = useState(group?.minSelect ?? 0);
  const [maxSelect, setMaxSelect] = useState(group?.maxSelect ?? 1);
  const [rows, setRows] = useState<OptionRow[]>(() => rowsFrom(group));
  const nextKey = useRef(rows.length);

  // Linhas adicionadas/removidas também contam como mudança (o DOM só muda depois do render).
  useEffect(() => {
    onChange();
  }, [rows.length, onChange]);

  useEffect(() => {
    if (state.status === "success" && !editing) {
      setMinSelect(0);
      setMaxSelect(1);
      setRows(rowsFrom(null));
      onCancel?.();
    }
  }, [state, editing, onCancel]);

  const required = minSelect >= 1;
  const localMinError =
    minSelect > maxSelect
      ? "O mínimo não pode ser maior que o máximo."
      : minSelect > rows.filter((row) => row.name.trim()).length && rows.some((r) => r.name.trim())
        ? "O mínimo não pode ser maior que o número de opções."
        : undefined;

  function updateRow(key: number, patch: Partial<OptionRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      className="space-y-5"
    >
      {editing ? (
        <input type="hidden" name="groupId" value={group.id} />
      ) : (
        <input type="hidden" name="itemId" value={itemId} />
      )}
      <input type="hidden" name="optionCount" value={rows.length} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem] flex-1">
          <Field
            id={`${id}-name`}
            name="name"
            label="Nome do grupo"
            defaultValue={group?.name ?? ""}
            placeholder="Ex.: Ponto da carne"
            maxLength={120}
            autoComplete="off"
            error={state.errors.name}
          />
        </div>
        <p className="flex min-h-12 items-center" aria-live="polite">
          <Badge tone={required ? "primary" : "neutral"}>
            {required ? "Obrigatório" : "Opcional"}
          </Badge>
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-[var(--color-ink)]">
          Quantas opções o Consumidor escolhe?
        </legend>
        <div className="flex flex-wrap gap-6">
          <Stepper
            id={`${id}-min`}
            name="minSelect"
            label="Mínimo"
            min={0}
            max={MAX_COMPLEMENT_OPTIONS}
            value={minSelect}
            onChange={setMinSelect}
            error={state.errors.minSelect ?? localMinError}
          />
          <Stepper
            id={`${id}-max`}
            name="maxSelect"
            label="Máximo"
            min={1}
            max={MAX_COMPLEMENT_OPTIONS}
            value={maxSelect}
            onChange={setMaxSelect}
            error={state.errors.maxSelect}
          />
        </div>
        <p role="status" className="text-sm font-bold text-[var(--color-ink)]">
          {selectionSummary(minSelect, maxSelect)}
        </p>
        <p className="max-w-[60ch] text-sm leading-relaxed text-[var(--color-body)]">
          Mínimo 0 deixa o grupo <strong>opcional</strong>; mínimo 1 ou mais torna o grupo{" "}
          <strong>obrigatório</strong> e o Consumidor só adiciona o item depois de escolher.{" "}
          {LIMIT_HELP}
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-[var(--color-ink)]">
          Opções · {rows.length} de {MAX_COMPLEMENT_OPTIONS}
        </legend>
        {state.errors.options ? (
          <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
            {state.errors.options}
          </p>
        ) : null}
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="grid gap-3 rounded-xl border border-[var(--color-hairline-soft)] p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
            >
              {row.id ? <input type="hidden" name={`options.${index}.id`} value={row.id} /> : null}
              <Field
                id={`${id}-opt-${row.key}-name`}
                name={`options.${index}.name`}
                label={`Opção ${index + 1}`}
                value={row.name}
                onChange={(event) => updateRow(row.key, { name: event.currentTarget.value })}
                placeholder="Ex.: Ao ponto"
                maxLength={120}
                autoComplete="off"
                error={state.errors[`options.${index}.name`]}
              />
              <Field
                id={`${id}-opt-${row.key}-price`}
                name={`options.${index}.priceCents`}
                label="Acréscimo (R$)"
                value={row.price}
                onChange={(event) => updateRow(row.key, { price: event.currentTarget.value })}
                placeholder="R$ 0,00"
                inputMode="numeric"
                data-money=""
                autoComplete="off"
                error={state.errors[`options.${index}.priceCents`]}
              />
              <button
                type="button"
                aria-label={`Remover opção ${row.name || index + 1}`}
                disabled={rows.length <= 1}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                className="min-h-12 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-error)] hover:border-[var(--color-error)] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remover
              </button>
            </li>
          ))}
        </ol>
        <Button
          variant="secondary"
          type="button"
          className="min-h-11 px-4 py-2 text-sm"
          disabled={rows.length >= MAX_COMPLEMENT_OPTIONS}
          onClick={() =>
            setRows((current) => [
              ...current,
              { id: null, key: nextKey.current++, name: "", price: "" },
            ])
          }
        >
          Nova opção
        </Button>
        <p className="text-xs text-[var(--color-muted)]">
          Acréscimo em branco = sem custo. Opção paga soma ao preço do item.
        </p>
      </fieldset>

      <div className="space-y-3">
        <ActionNotice state={state} />
        {editing && !dirty && state.status !== "success" ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <SubmitButton
            disabled={editing && !dirty}
            pendingLabel={editing ? "Salvando..." : "Criando..."}
          >
            {editing ? "Salvar grupo" : "Criar grupo"}
          </SubmitButton>
          {onCancel ? (
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
    </ActionForm>
  );
}

function GroupCard({
  actions,
  group,
  ids,
  itemId,
}: {
  actions: ComplementActions;
  group: AdminComplementGroup;
  ids: string[];
  itemId: string;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  return (
    <li
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--color-hairline)] p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="flex flex-wrap items-center gap-2 font-bold text-[var(--color-ink)]"
          >
            {group.name}
            <Badge tone={group.minSelect >= 1 ? "primary" : "neutral"}>
              {group.minSelect >= 1 ? "Obrigatório" : "Opcional"}
            </Badge>
          </h3>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            {selectionSummary(group.minSelect, group.maxSelect)}
          </p>
          {!open ? (
            <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">
              {group.options.map((option) => option.name).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ReorderButtons
            action={actions.reorderComplementGroups}
            hidden={{ itemId }}
            id={group.id}
            ids={ids}
            label={group.name}
          />
          <Button
            variant="secondary"
            type="button"
            className="min-h-11 px-4 py-2 text-sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Fechar" : "Editar"}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-5 space-y-5 border-t border-[var(--color-hairline-soft)] pt-5">
          <GroupForm action={actions.updateComplementGroup} group={group} itemId={itemId} />
          <ConfirmDialogForm
            action={actions.deleteComplementGroup}
            confirmLabel="Apagar grupo"
            description={
              <p>
                O grupo <strong>{group.name}</strong> e suas{" "}
                {pluralize(group.options.length, "opção", "opções")} saem deste item. Pedidos já
                feitos não mudam.
              </p>
            }
            hidden={{ groupId: group.id }}
            title={`Apagar ${group.name}?`}
            trigger="Apagar grupo"
          />
        </div>
      ) : null}
    </li>
  );
}

function CopyGroupsForm({
  action,
  sources,
  targetItemId,
}: {
  action: MenuAction;
  sources: CopySource[];
  targetItemId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [sourceId, setSourceId] = useState("");
  const id = useId();
  const source = sources.find((item) => item.id === sourceId) ?? null;
  return (
    <ActionForm action={formAction} state={state} className="space-y-4">
      <input type="hidden" name="targetItemId" value={targetItemId} />
      <SelectField
        id={`${id}-source`}
        name="sourceItemId"
        label="Copiar grupos de"
        value={sourceId}
        onChange={(event) => setSourceId(event.currentTarget.value)}
        error={state.errors.sourceItemId}
        hint="A cópia é independente: editar aqui não muda o item de origem."
      >
        <option value="">Escolha um item</option>
        {sources.map((item) => (
          <option key={item.id} value={item.id}>
            {item.categoryName} › {item.name} ({item.complementGroups.length})
          </option>
        ))}
      </SelectField>
      {source ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-[var(--color-ink)]">
            Grupos de {source.name}
          </legend>
          {state.errors.groupIds ? (
            <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
              {state.errors.groupIds}
            </p>
          ) : null}
          {source.complementGroups.map((group) => (
            <label key={group.id} className="foode-choice foode-choice--checkbox">
              <input
                type="checkbox"
                name="groupIds"
                value={group.id}
                defaultChecked
                className="foode-choice__input"
              />
              <span className="foode-choice__label">
                {group.name}
                <span className="block text-xs text-[var(--color-muted)]">
                  {selectionSummary(group.minSelect, group.maxSelect)} ·{" "}
                  {pluralize(group.options.length, "opção", "opções")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <ActionNotice state={state} />
      <SubmitButton disabled={!source} pendingLabel="Copiando...">
        Copiar grupos escolhidos
      </SubmitButton>
    </ActionForm>
  );
}

export function ComplementGroupsSection({
  actions,
  item,
  sources,
}: {
  actions: ComplementActions;
  item: AdminMenuItem;
  sources: CopySource[];
}) {
  const [mode, setMode] = useState<"idle" | "new" | "copy">("idle");
  const headingId = useId();
  const ids = item.complementGroups.map((group) => group.id);
  const copyable = sources.filter((source) => source.complementGroups.length > 0);

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          id={headingId}
          description="Escolhas que fazem parte do item (ponto da carne, sabor, tamanho). Cada grupo diz quantas opções o Consumidor escolhe; opção pode ter acréscimo."
        >
          Complementos
        </SectionHeading>
        <div className="flex flex-wrap gap-2">
          {copyable.length > 0 ? (
            <Button
              variant="secondary"
              type="button"
              aria-expanded={mode === "copy"}
              onClick={() => setMode(mode === "copy" ? "idle" : "copy")}
            >
              Copiar grupos de outro item
            </Button>
          ) : null}
          <Button
            type="button"
            aria-expanded={mode === "new"}
            onClick={() => setMode(mode === "new" ? "idle" : "new")}
          >
            Novo grupo
          </Button>
        </div>
      </div>

      {mode === "new" ? (
        <div className="rounded-2xl border border-[var(--color-primary)] p-4 md:p-5">
          <h3 className="mb-4 font-bold text-[var(--color-ink)]">Novo grupo de Complemento</h3>
          <GroupForm
            action={actions.createComplementGroup}
            group={null}
            itemId={item.id}
            onCancel={() => setMode("idle")}
          />
        </div>
      ) : null}

      {mode === "copy" ? (
        <div className="rounded-2xl border border-[var(--color-primary)] p-4 md:p-5">
          <h3 className="mb-4 font-bold text-[var(--color-ink)]">Copiar grupos de outro item</h3>
          <CopyGroupsForm
            action={actions.copyComplementGroups}
            sources={copyable}
            targetItemId={item.id}
          />
        </div>
      ) : null}

      {item.complementGroups.length === 0 && mode === "idle" ? (
        <EmptyState title="Este item ainda não tem Complementos.">
          <p>
            Crie um grupo (ex.: "Ponto da carne" com Mal passado, Ao ponto, Bem passado)
            {copyable.length > 0 ? " ou copie os grupos de outro item" : ""}. Extras pagos sem
            limite, como Molho extra, são Adicionais.
          </p>
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {item.complementGroups.map((group) => (
            <GroupCard key={group.id} actions={actions} group={group} ids={ids} itemId={item.id} />
          ))}
        </ol>
      )}
    </section>
  );
}
