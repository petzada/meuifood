"use client";

// Detalhe do item (I1–I8): todos os grupos numa rolagem só, selo "Obrigatório" e contador
// em `aria-live`, Radio/Checkbox de `@foode/ui`, Adicionais com "+ R$", contador −/+ e CTA
// fixo que diz o que falta e rola até a pendência (G2). Sem observação por item (P-1.5).
import { formatBRL } from "@foode/shared/money";
import { Badge, Button, Checkbox, Price, Radio } from "@foode/ui";
import { Minus, Plus, ShareNetwork } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { CartLine, ComplementGroup, MenuItem } from "@foode/shared/menu";
import { MAX_LINE_QUANTITY, cartLineErrorMessagePt, validateCartLine } from "@foode/shared/menu";

import {
  emptySelection,
  groupStatus,
  selectionCta,
  selectionFromLine,
  setQuantity,
  toCartLine,
  toggleAdditional,
  toggleOption,
  type ItemSelection,
} from "./item-selection";
import { ItemThumb } from "./menu-item-card";
import { Sheet } from "./sheet";

export const ITEM_SHEET_TITLE_ID = "item-sheet-title";

/** Grupo com muitas opções ganha filtro (I4). */
export const GROUP_FILTER_MIN_OPTIONS = 10;

export type ItemSheetProps = {
  /** Linha em edição (K2): preenche as escolhas e troca "Adicionar" por "Salvar". */
  editingLine?: CartLine | null;
  item: MenuItem | null;
  onClose: () => void;
  onShare: (item: MenuItem) => void;
  onSubmit: (line: CartLine) => void;
  open: boolean;
};

function groupAnchorId(groupId: string): string {
  return `grupo-${groupId}`;
}

function ComplementGroupFieldset({
  group,
  itemId,
  onToggle,
  pendingAlert,
  selection,
}: {
  group: ComplementGroup;
  itemId: string;
  onToggle: (optionId: string) => void;
  pendingAlert: boolean;
  selection: ItemSelection;
}) {
  const status = groupStatus(group, selection);
  const [filter, setFilter] = useState("");
  const selectedIds = selection.complementSelections[group.id] ?? [];
  const filterNormalized = filter.trim().toLowerCase();
  const options = filterNormalized
    ? group.options.filter((option) => option.name.toLowerCase().includes(filterNormalized))
    : group.options;
  const Control = group.maxSelect === 1 ? Radio : Checkbox;

  return (
    <fieldset
      aria-describedby={pendingAlert ? `${groupAnchorId(group.id)}-alert` : undefined}
      className="scroll-mt-4 border-t border-[var(--color-hairline-soft)] pt-4"
      id={groupAnchorId(group.id)}
      tabIndex={-1}
    >
      <legend className="float-left w-full">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-bold text-[var(--color-ink)]">{group.name}</span>
            <span className="block text-sm text-[var(--color-muted)]">{status.instruction}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {status.required ? <Badge tone="primary">Obrigatório</Badge> : null}
            <span
              aria-label={`${status.selected} de ${group.maxSelect} escolhidos`}
              aria-live="polite"
              className="text-sm font-bold tabular-nums text-[var(--color-body)]"
            >
              {status.counter}
            </span>
          </span>
        </span>
      </legend>
      <div className="clear-both" />
      {group.options.length >= GROUP_FILTER_MIN_OPTIONS ? (
        <input
          aria-label={`Filtrar opções de ${group.name}`}
          autoComplete="off"
          className="foode-control mt-3"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Pesquise pelo nome"
          type="search"
          value={filter}
        />
      ) : null}
      {pendingAlert ? (
        <p
          className="mt-3 text-sm font-bold text-[var(--color-error)]"
          id={`${groupAnchorId(group.id)}-alert`}
          role="alert"
        >
          {cartLineErrorMessagePt.complement_too_few}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {options.map((option) => {
          const checked = selectedIds.includes(option.id);
          const blocked = !checked && group.maxSelect > 1 && status.atMax;
          return (
            <Control
              checked={checked}
              disabled={blocked}
              key={option.id}
              name={`${itemId}-${group.id}`}
              onChange={() => onToggle(option.id)}
              trailing={option.priceCents > 0 ? `+ ${formatBRL(option.priceCents)}` : undefined}
              value={option.id}
            >
              {option.name}
            </Control>
          );
        })}
        {options.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma opção com esse nome.</p>
        ) : null}
      </div>
      {group.maxSelect > 1 && status.atMax ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Máximo de {group.maxSelect} atingido. Desmarque uma opção para trocar.
        </p>
      ) : null}
    </fieldset>
  );
}

export function ItemSheet({ editingLine, item, onClose, onShare, onSubmit, open }: ItemSheetProps) {
  const [selection, setSelection] = useState<ItemSelection>(emptySelection);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const itemKey = item?.id ?? null;
  const editingKey = editingLine ? JSON.stringify(editingLine) : null;

  useEffect(() => {
    if (!open) return;
    setSelection(editingLine ? selectionFromLine(editingLine) : emptySelection());
    setPendingGroupId(null);
  }, [open, itemKey, editingKey, editingLine]);

  if (!item) return null;

  const cta = selectionCta(item, selection, editingLine ? "Salvar" : "Adicionar");
  const quantityLabel = `${selection.quantity}`;

  function submit() {
    if (!item) return;
    if (cta.kind === "pending") {
      const groupId = cta.groupId || item.complementGroups[0]?.id || null;
      setPendingGroupId(groupId);
      if (groupId) {
        const target = document.getElementById(groupAnchorId(groupId));
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        target?.focus({ preventScroll: true });
      }
      return;
    }
    if (cta.kind !== "ready") return;
    const line = toCartLine(item.id, selection);
    if (!validateCartLine(item, line).ok) return;
    onSubmit(line);
  }

  const footer =
    cta.kind === "unavailable" ? (
      <p className="text-center text-sm font-bold text-[var(--color-muted)]" role="status">
        Este item está indisponível no momento.
      </p>
    ) : (
      <div className="flex items-center gap-3">
        <div
          className="flex shrink-0 items-center rounded-full border border-[var(--color-hairline)]"
          role="group"
          aria-label="Quantidade"
        >
          <button
            aria-label="Diminuir quantidade"
            className="foode-icon-button"
            disabled={selection.quantity <= 1}
            onClick={() => setSelection((current) => setQuantity(current, current.quantity - 1))}
            type="button"
          >
            <Minus aria-hidden size={18} weight="bold" />
          </button>
          <span
            aria-live="polite"
            className="min-w-8 text-center font-bold tabular-nums text-[var(--color-ink)]"
          >
            {quantityLabel}
          </span>
          <button
            aria-label="Aumentar quantidade"
            className="foode-icon-button"
            disabled={selection.quantity >= MAX_LINE_QUANTITY}
            onClick={() => setSelection((current) => setQuantity(current, current.quantity + 1))}
            type="button"
          >
            <Plus aria-hidden size={18} weight="bold" />
          </button>
        </div>
        <Button
          aria-disabled={cta.kind === "pending" ? true : undefined}
          className={["min-w-0 flex-1", cta.kind === "pending" && "foode-button--pending"]
            .filter(Boolean)
            .join(" ")}
          onClick={submit}
        >
          <span className="truncate">{cta.label}</span>
        </Button>
      </div>
    );

  return (
    <Sheet footer={footer} labelledBy={ITEM_SHEET_TITLE_ID} onClose={onClose} open={open} wide>
      <div ref={bodyRef}>
        {item.imageUrl ? (
          <img
            alt=""
            className="aspect-[16/9] w-full rounded-2xl border border-[var(--color-hairline-soft)] object-cover"
            src={item.imageUrl}
          />
        ) : null}
        <div className={`flex items-start gap-3 ${item.imageUrl ? "mt-4" : ""}`}>
          {item.imageUrl ? null : <ItemThumb imageUrl={null} size="lg" />}
          <div className="min-w-0 flex-1">
            <h2
              className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
              id={ITEM_SHEET_TITLE_ID}
            >
              {item.name}
            </h2>
            {item.description ? (
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-body)]">
                {item.description}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-3">
              <Price cents={item.priceCents} format={formatBRL} size="large" />
              {item.available ? null : <Badge tone="neutral">Indisponível</Badge>}
            </div>
          </div>
          <button
            aria-label={`Compartilhar ${item.name}`}
            className="foode-icon-button shrink-0"
            onClick={() => onShare(item)}
            type="button"
          >
            <ShareNetwork aria-hidden size={20} weight="bold" />
          </button>
        </div>

        <div className="mt-5 grid gap-5">
          {item.complementGroups.map((group) => (
            <ComplementGroupFieldset
              group={group}
              itemId={item.id}
              key={group.id}
              onToggle={(optionId) => {
                setPendingGroupId(null);
                setSelection((current) => toggleOption(current, group, optionId));
              }}
              pendingAlert={pendingGroupId === group.id}
              selection={selection}
            />
          ))}

          {item.additionals.length > 0 ? (
            <fieldset className="border-t border-[var(--color-hairline-soft)] pt-4">
              <legend className="float-left w-full">
                <span className="block font-bold text-[var(--color-ink)]">Adicionais</span>
                <span className="block text-sm text-[var(--color-muted)]">Opcional</span>
              </legend>
              <div className="clear-both" />
              <div className="mt-3 grid gap-2">
                {item.additionals.map((additional) => (
                  <Checkbox
                    checked={selection.additionalIds.includes(additional.id)}
                    disabled={!additional.available}
                    key={additional.id}
                    name={`${item.id}-adicional`}
                    onChange={() =>
                      setSelection((current) => toggleAdditional(current, additional.id))
                    }
                    trailing={
                      additional.available
                        ? `+ ${formatBRL(additional.priceCents)}`
                        : "Indisponível"
                    }
                    value={additional.id}
                  >
                    {additional.name}
                  </Checkbox>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
