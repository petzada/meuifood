"use client";

// Card de item (C3): nome, descrição em 2 linhas, preço e foto 1:1 (ou placeholder neutro).
// O card inteiro é o alvo; indisponível fica esmaecido com Badge e não abre.
import { formatBRL } from "@foode/shared/money";
import { Badge, Price } from "@foode/ui";
import { ForkKnife } from "@phosphor-icons/react";
import type { MenuItem } from "@foode/shared/menu";

export function ItemThumb({
  imageUrl,
  size = "md",
}: {
  imageUrl: string | null;
  size?: "md" | "lg";
}) {
  const dimension = size === "lg" ? "size-24" : "size-20";
  return (
    <span
      aria-hidden
      className={`${dimension} grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--color-hairline-soft)] text-[var(--color-hairline)]`}
    >
      {imageUrl ? (
        <img alt="" className="size-full object-cover" loading="lazy" src={imageUrl} />
      ) : (
        <ForkKnife aria-hidden size={28} weight="bold" />
      )}
    </span>
  );
}

export function MenuItemCard({
  item,
  onOpen,
}: {
  item: MenuItem;
  onOpen: (item: MenuItem) => void;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[var(--color-ink)]">{item.name}</span>
          {item.available ? null : <Badge tone="neutral">Indisponível</Badge>}
        </span>
        {item.description ? (
          <span className="mt-1 line-clamp-2 block text-sm leading-snug text-[var(--color-body)]">
            {item.description}
          </span>
        ) : null}
        <Price cents={item.priceCents} className="mt-2" format={formatBRL} />
      </span>
      <ItemThumb imageUrl={item.imageUrl} />
    </>
  );

  if (!item.available) {
    return (
      <li className="foode-outline flex items-start gap-3 p-3 opacity-60" aria-disabled="true">
        {content}
      </li>
    );
  }

  return (
    <li>
      <button
        className="foode-outline foode-item-card flex w-full items-start gap-3 p-3 text-left"
        onClick={() => onOpen(item)}
        type="button"
      >
        {content}
      </button>
    </li>
  );
}
