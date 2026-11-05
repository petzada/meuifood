"use client";

// Revisão do carrinho (K1–K6): linhas com escolhas agrupadas, −/+ com lixeira em 1,
// "Editar" em texto, linha inválida destacada com a mensagem PT-BR, subtotal local na hora
// e recálculo no servidor como fonte de verdade (G7). O CTA leva ao checkout do Ticket 24a;
// com pedido mínimo do Delivery, a faixa "Faltam R$ X" (K7) avisa antes; Loja fechada ou em
// Pausa bloqueia o CTA com o motivo (decisão 41).
import { cartLineErrorMessagePt, type Cart, type MenuItem } from "@foode/shared/menu";
import { formatBRL } from "@foode/shared/money";
import { minimumOrderGap } from "@foode/shared/order";
import { Button, Price } from "@foode/ui";
import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { quoteCart, type CartQuote } from "./cart-quote";
import { describeLineChoices, summarizeCart, type CartLineView } from "./cart-store";
import { Sheet } from "./sheet";
import { blockedCheckoutMessage, type StoreAvailabilityView } from "./store-status";

export function checkoutPath(storeSlug: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/finalizar`;
}

export const CART_SHEET_TITLE_ID = "carrinho-sheet-title";

export type CartSheetProps = {
  /** Sem estado (api indisponível): o CTA segue liberado e a api decide no envio. */
  availability?: StoreAvailabilityView | null;
  cart: Cart;
  /** Pedido mínimo do Delivery (P-2.5); null sem mínimo ou sem Delivery. */
  deliveryMinimumCents?: number | null;
  itemsById: ReadonlyMap<string, MenuItem>;
  onClose: () => void;
  onEdit: (lineIndex: number) => void;
  onQuantity: (lineIndex: number, quantity: number) => void;
  onRemove: (lineIndex: number) => void;
  open: boolean;
  /** Loja em configuração (decisão 74): mostra o carrinho, mas não leva ao checkout. */
  preview?: boolean;
  /** Injetável nos testes; por padrão usa `quoteCart` com `fetch`. */
  quote?: typeof quoteCart;
};

function CartLineRow({
  onEdit,
  onQuantity,
  onRemove,
  serverError,
  view,
}: {
  onEdit: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  serverError: string | null;
  view: CartLineView;
}) {
  const { item, line } = view;
  const name = item?.name ?? "Item fora do Cardápio";
  const error = serverError ?? (view.error ? cartLineErrorMessagePt[view.error.code] : null);
  const choices = item ? describeLineChoices(item, line) : [];

  return (
    <li
      className={["foode-outline p-3", error && "border-[var(--color-error)]"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[var(--color-ink)]">
            <span className="tabular-nums">{line.quantity}×</span> {name}
          </p>
          {choices.length > 0 ? (
            <ul className="mt-1 grid gap-0.5 text-sm text-[var(--color-body)]" role="list">
              {choices.map((choice) => (
                <li key={choice}>{choice}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm font-bold text-[var(--color-error)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {view.subtotalCents !== null ? (
          <Price cents={view.subtotalCents} className="shrink-0" format={formatBRL} />
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {item && !error ? (
          <button
            className="min-h-11 px-1 text-sm font-bold text-[var(--color-primary-strong)]"
            onClick={onEdit}
            type="button"
          >
            Editar
          </button>
        ) : (
          <span className="flex gap-3">
            {item &&
            view.error?.code !== "item_unavailable" &&
            view.error?.code !== "item_not_found" ? (
              <button
                className="min-h-11 px-1 text-sm font-bold text-[var(--color-primary-strong)]"
                onClick={onEdit}
                type="button"
              >
                Editar
              </button>
            ) : null}
            <button
              className="min-h-11 px-1 text-sm font-bold text-[var(--color-body)]"
              onClick={onRemove}
              type="button"
            >
              Remover
            </button>
          </span>
        )}
        <div
          aria-label={`Quantidade de ${name}`}
          className="flex items-center rounded-full border border-[var(--color-hairline)]"
          role="group"
        >
          {line.quantity <= 1 ? (
            <button
              aria-label={`Remover ${name}`}
              className="foode-icon-button"
              onClick={onRemove}
              type="button"
            >
              <Trash aria-hidden size={18} weight="bold" />
            </button>
          ) : (
            <button
              aria-label="Diminuir quantidade"
              className="foode-icon-button"
              onClick={() => onQuantity(line.quantity - 1)}
              type="button"
            >
              <Minus aria-hidden size={18} weight="bold" />
            </button>
          )}
          <span
            aria-live="polite"
            className="min-w-8 text-center font-bold tabular-nums text-[var(--color-ink)]"
          >
            {line.quantity}
          </span>
          <button
            aria-label="Aumentar quantidade"
            className="foode-icon-button"
            disabled={line.quantity >= 99}
            onClick={() => onQuantity(line.quantity + 1)}
            type="button"
          >
            <Plus aria-hidden size={18} weight="bold" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function CartSheet({
  availability = null,
  cart,
  deliveryMinimumCents = null,
  itemsById,
  onClose,
  onEdit,
  onQuantity,
  onRemove,
  open,
  preview = false,
  quote = quoteCart,
}: CartSheetProps) {
  const summary = useMemo(() => summarizeCart(itemsById, cart), [itemsById, cart]);
  const [serverQuote, setServerQuote] = useState<CartQuote | null>(null);
  const { lines, storeSlug } = cart;

  useEffect(() => {
    // Na prévia a api não cota (só Loja `active` vende): fica o subtotal local.
    if (!open || preview || lines.length === 0 || summary.hasInvalidLines) {
      setServerQuote(null);
      return;
    }
    let cancelled = false;
    void quote(storeSlug, lines).then((result) => {
      if (!cancelled) setServerQuote(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, preview, lines, storeSlug, summary.hasInvalidLines, quote]);

  const serverErrorIndex = serverQuote && !serverQuote.ok ? serverQuote.lineIndex : null;
  const serverErrorMessage =
    serverQuote && !serverQuote.ok ? cartLineErrorMessagePt[serverQuote.error.code] : null;
  const subtotalCents = serverQuote?.ok ? serverQuote.subtotalCents : summary.subtotalCents;
  const blocked = summary.hasInvalidLines || serverErrorIndex !== null;
  const closedMessage = preview
    ? "Esta Loja ainda não está recebendo pedidos."
    : availability
      ? blockedCheckoutMessage(availability)
      : null;
  const gap = minimumOrderGap(subtotalCents, deliveryMinimumCents);
  const belowMinimum = gap !== null && gap.missingCents > 0;

  const footer =
    cart.lines.length === 0 ? null : (
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[var(--color-ink)]">Subtotal</span>
          <Price aria-live="polite" cents={subtotalCents} format={formatBRL} size="large" />
        </div>
        {blocked ? (
          <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
            Revise os itens destacados para continuar.
          </p>
        ) : closedMessage ? (
          <p className="text-sm font-bold text-[var(--color-ink)]" role="status">
            {closedMessage}
          </p>
        ) : belowMinimum ? (
          <p className="text-sm text-[var(--color-ink)]" role="status">
            Faltam <strong>{formatBRL(gap.missingCents)}</strong> para o pedido mínimo de{" "}
            {formatBRL(gap.minimumCents)} no Delivery.
          </p>
        ) : null}
        {blocked || closedMessage ? (
          <Button aria-disabled="true" className="foode-button--pending" onClick={onClose}>
            {closedMessage ? "Pedidos indisponíveis agora" : "Revise o carrinho"}
          </Button>
        ) : (
          <Button href={checkoutPath(storeSlug)}>
            <span className="flex w-full items-center justify-between gap-3">
              <span>Finalizar pedido</span>
              <span className="tabular-nums">{formatBRL(subtotalCents)}</span>
            </span>
          </Button>
        )}
        <Button onClick={onClose} variant="secondary">
          Adicionar mais itens
        </Button>
      </div>
    );

  return (
    <Sheet
      footer={footer}
      labelledBy={CART_SHEET_TITLE_ID}
      onClose={onClose}
      open={open}
      title="Carrinho"
    >
      {cart.lines.length === 0 ? (
        <div className="grid gap-4 py-6 text-center">
          <p className="text-[var(--color-body)]">Seu carrinho está vazio.</p>
          <Button className="justify-self-center" onClick={onClose} variant="secondary">
            Ver Cardápio
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3" role="list">
          {summary.lines.map((view) => (
            <CartLineRow
              key={`${view.line.itemId}-${view.lineIndex}`}
              onEdit={() => onEdit(view.lineIndex)}
              onQuantity={(quantity) => onQuantity(view.lineIndex, quantity)}
              onRemove={() => onRemove(view.lineIndex)}
              serverError={serverErrorIndex === view.lineIndex ? serverErrorMessage : null}
              view={view}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
