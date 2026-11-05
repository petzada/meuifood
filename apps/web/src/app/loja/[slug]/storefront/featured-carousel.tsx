"use client";

// Destaques (decisão 63, P-5.5): até 4 itens marcados pelo Dono, rolagem horizontal com
// snap. Some quando não há destaque disponível ou durante a busca.
import { formatBRL } from "@foode/shared/money";
import { Price } from "@foode/ui";
import { ForkKnife } from "@phosphor-icons/react";
import type { MenuItem } from "@foode/shared/menu";

export function FeaturedCarousel({
  items,
  onOpen,
}: {
  items: MenuItem[];
  onOpen: (item: MenuItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="destaques-title" className="mx-auto max-w-3xl pt-6">
      <h2
        className="px-4 text-lg font-bold tracking-[-0.02em] text-[var(--color-ink)] md:px-8"
        id="destaques-title"
      >
        Destaques
      </h2>
      <ul className="foode-carousel mt-3 flex gap-3 overflow-x-auto px-4 pb-2 md:px-8" role="list">
        {items.map((item) => (
          <li className="w-[68%] shrink-0 snap-start sm:w-64" key={item.id}>
            <button
              className="foode-outline foode-item-card block w-full overflow-hidden text-left"
              onClick={() => onOpen(item)}
              type="button"
            >
              <span
                aria-hidden
                className="grid aspect-[16/10] w-full place-items-center border-b border-[var(--color-hairline-soft)] text-[var(--color-hairline)]"
              >
                {item.imageUrl ? (
                  <img
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    src={item.imageUrl}
                  />
                ) : (
                  <ForkKnife aria-hidden size={36} weight="bold" />
                )}
              </span>
              <span className="block p-3">
                <span className="line-clamp-1 block font-bold text-[var(--color-ink)]">
                  {item.name}
                </span>
                <Price cents={item.priceCents} className="mt-1" format={formatBRL} size="small" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
