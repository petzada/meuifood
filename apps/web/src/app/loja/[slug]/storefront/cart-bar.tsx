"use client";

// Barra fixa do carrinho (K1): só com itens, "Ver carrinho · 2 itens · R$ 113,78" (subtotal,
// sem a palavra "Total"). Sem barra de abas (P-5.2).
import { formatBRL } from "@foode/shared/money";
import { Button } from "@foode/ui";

export function CartBar({
  itemCount,
  onOpen,
  subtotalCents,
}: {
  itemCount: number;
  onOpen: () => void;
  subtotalCents: number;
}) {
  if (itemCount === 0) return null;
  const count = itemCount === 1 ? "1 item" : `${itemCount} itens`;
  return (
    <div className="foode-cart-bar">
      <div className="mx-auto max-w-3xl">
        <Button className="w-full" onClick={onOpen}>
          <span className="flex w-full items-center justify-between gap-3">
            <span>Ver carrinho</span>
            <span className="tabular-nums">
              {count} · {formatBRL(subtotalCents)}
            </span>
          </span>
        </Button>
      </div>
    </div>
  );
}
