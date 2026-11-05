"use client";

// Raiz do Storefront no navegador: orquestra cabeçalho (com estado da Loja e "Sobre a Loja"),
// busca, Destaques, categorias, sheet do item (aberta por `?item=`), carrinho persistido por
// Loja, barra fixa e toasts.
import {
  MENU_ITEM_SHARE_PARAM,
  MENU_SEARCH_MIN_LENGTH,
  featuredItems,
  indexMenuItems,
  normalizeSearchText,
  searchMenu,
  type CartLine,
  type MenuItem,
  type PublicMenu,
} from "@foode/shared/menu";
import type { StorefrontStoreState } from "@foode/shared/order";
import { Button } from "@foode/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AboutStoreSheet } from "./about-store-sheet";
import { CartBar } from "./cart-bar";
import { CartSheet } from "./cart-sheet";
import { cartItemCount, summarizeCart } from "./cart-store";
import { CategoryNav, categoryAnchorId } from "./category-nav";
import { FeaturedCarousel } from "./featured-carousel";
import { ItemSheet } from "./item-sheet";
import { MenuItemCard } from "./menu-item-card";
import { MenuSearch } from "./menu-search";
import { itemShareUrl, shareLink, shareOutcomeMessagePt, storeShareUrl } from "./share";
import { StoreHeader, type StoreBranding } from "./store-header";
import { describeAvailability } from "./store-status";
import { Toast, useToast } from "./toast";
import { useStoreCart } from "./use-store-cart";

export type StorefrontProps = {
  branding?: StoreBranding;
  menu: PublicMenu;
  /** Instante de referência para "abre hoje/amanhã" (injetável nos testes). */
  now?: number;
  /** Estado da Loja (24a); null enquanto a api não responde — o Cardápio segue visível. */
  state?: StorefrontStoreState | null;
};

export function Storefront({ branding, menu, now, state = null }: StorefrontProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const itemsById = useMemo(() => indexMenuItems(menu), [menu]);
  const featured = useMemo(() => featuredItems(menu), [menu]);
  const { cart, dispatch } = useStoreCart(menu.slug);
  const { dismiss, show, toast } = useToast();

  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const availability = useMemo(
    () => (state ? describeAvailability(state.availability, now) : null),
    [now, state],
  );
  const [editing, setEditing] = useState<{ line: CartLine; lineIndex: number } | null>(null);
  const openedByPushRef = useRef(false);

  const searching = normalizeSearchText(query).length >= MENU_SEARCH_MIN_LENGTH;
  const visibleCategories = useMemo(
    () => (searching ? searchMenu(menu.categories, query) : menu.categories),
    [menu.categories, query, searching],
  );
  const resultCount = searching
    ? visibleCategories.reduce((total, category) => total + category.items.length, 0)
    : null;

  const openItemId = searchParams.get(MENU_ITEM_SHARE_PARAM);
  const openItem = openItemId ? (itemsById.get(openItemId) ?? null) : null;
  const itemOpen = openItem !== null;

  useEffect(() => {
    // `?item=` desconhecido (saiu do Cardápio): limpa a URL e avisa.
    if (openItemId && !openItem) {
      router.replace(pathname, { scroll: false });
      show("Este item saiu do Cardápio.");
    }
  }, [openItem, openItemId, pathname, router, show]);

  const openItemSheet = useCallback(
    (item: MenuItem) => {
      openedByPushRef.current = true;
      const params = new URLSearchParams(searchParams.toString());
      params.set(MENU_ITEM_SHARE_PARAM, item.id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeItemSheet = useCallback(() => {
    setEditing(null);
    if (openedByPushRef.current) {
      openedByPushRef.current = false;
      router.back();
      return;
    }
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const summary = useMemo(() => summarizeCart(itemsById, cart), [itemsById, cart]);

  function handleSubmitLine(line: CartLine) {
    const item = itemsById.get(line.itemId);
    if (editing) {
      dispatch({ line, lineIndex: editing.lineIndex, type: "replace" });
      closeItemSheet();
      setCartOpen(true);
      show(`${item?.name ?? "Item"} atualizado`);
      return;
    }
    dispatch({ line, type: "add" });
    closeItemSheet();
    show(`${item?.name ?? "Item"} adicionado`, {
      label: "Ver carrinho",
      onClick: () => setCartOpen(true),
    });
  }

  function handleRemove(lineIndex: number) {
    const view = summary.lines[lineIndex];
    if (!view) return;
    dispatch({ lineIndex, type: "remove" });
    show(
      `${view.item?.name ?? "Item"} removido`,
      {
        label: "Desfazer",
        onClick: () => dispatch({ line: view.line, lineIndex, type: "restore" }),
      },
      5000,
    );
  }

  function handleEdit(lineIndex: number) {
    const view = summary.lines[lineIndex];
    if (!view?.item) return;
    setEditing({ line: view.line, lineIndex });
    setCartOpen(false);
    openItemSheet(view.item);
  }

  async function share(data: { text: string; title: string; url: string }) {
    const outcome = await shareLink(navigator, data);
    if (outcome === "shared" || outcome === "dismissed") return;
    show(shareOutcomeMessagePt[outcome]);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] pb-28">
      <StoreHeader
        {...(branding ? { branding } : {})}
        availability={availability}
        name={menu.name}
        {...(state ? { onAbout: () => setAboutOpen(true) } : {})}
        onShare={() =>
          void share({
            text: `Veja o Cardápio de ${menu.name}`,
            title: menu.name,
            url: storeShareUrl(origin, menu.slug),
          })
        }
      />

      {menu.categories.length === 0 ? (
        <section className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="foode-outline p-6">
            <h2 className="text-xl font-bold text-[var(--color-ink)]">Cardápio em preparação</h2>
            <p className="mt-2 text-[var(--color-body)]">
              Esta Loja ainda não publicou itens disponíveis. Volte em breve.
            </p>
          </div>
        </section>
      ) : (
        <>
          <MenuSearch onChange={setQuery} resultCount={resultCount} value={query} />
          {searching ? null : <FeaturedCarousel items={featured} onOpen={openItemSheet} />}
          {searching ? null : (
            <div className="mt-4">
              <CategoryNav categories={menu.categories} />
            </div>
          )}

          {searching && visibleCategories.length === 0 ? (
            <section className="mx-auto max-w-3xl px-4 py-10 md:px-8" aria-live="polite">
              <div className="foode-outline grid gap-4 p-6 text-center">
                <p className="text-[var(--color-body)]">Nenhum item com “{query.trim()}”.</p>
                <Button
                  className="justify-self-center"
                  onClick={() => setQuery("")}
                  variant="secondary"
                >
                  Ver todas as categorias
                </Button>
              </div>
            </section>
          ) : (
            <div className="mx-auto grid max-w-3xl gap-8 px-4 pt-6 md:px-8">
              {visibleCategories.map((category) => (
                <section
                  aria-labelledby={`${categoryAnchorId(category.id)}-title`}
                  className="scroll-mt-14"
                  data-category-id={category.id}
                  id={categoryAnchorId(category.id)}
                  key={category.id}
                >
                  <h2
                    className="text-lg font-bold tracking-[-0.02em] text-[var(--color-ink)]"
                    id={`${categoryAnchorId(category.id)}-title`}
                  >
                    {category.name}
                  </h2>
                  <ul className="mt-3 grid gap-3" role="list">
                    {category.items.map((item) => (
                      <MenuItemCard item={item} key={item.id} onOpen={openItemSheet} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <ItemSheet
        editingLine={editing?.line ?? null}
        item={openItem}
        onClose={closeItemSheet}
        onShare={(item) =>
          void share({
            text: `${item.name} · ${menu.name}`,
            title: item.name,
            url: itemShareUrl(origin, menu.slug, item.id),
          })
        }
        onSubmit={handleSubmitLine}
        open={itemOpen}
      />

      {state ? (
        <AboutStoreSheet onClose={() => setAboutOpen(false)} open={aboutOpen} state={state} />
      ) : null}

      <CartSheet
        availability={availability}
        cart={cart}
        deliveryMinimumCents={state?.delivery?.minimumOrderCents ?? null}
        itemsById={itemsById}
        onClose={() => setCartOpen(false)}
        onEdit={handleEdit}
        onQuantity={(lineIndex, quantity) =>
          dispatch({ lineIndex, quantity, type: "set_quantity" })
        }
        onRemove={handleRemove}
        open={cartOpen}
      />

      <CartBar
        itemCount={cartItemCount(cart)}
        onOpen={() => setCartOpen(true)}
        subtotalCents={summary.subtotalCents}
      />

      <Toast onDismiss={dismiss} toast={toast} />
    </main>
  );
}
