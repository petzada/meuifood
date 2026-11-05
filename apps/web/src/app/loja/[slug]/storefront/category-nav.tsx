"use client";

// Abas de categoria (C2): `nav` sticky com links-âncora, aba ativa por scroll-spy
// (`aria-current`) e botão "Categorias" que abre a lista completa num sheet.
import { List } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MenuCategory } from "@foode/shared/menu";

import { Sheet } from "./sheet";

export function categoryAnchorId(categoryId: string): string {
  return `categoria-${categoryId}`;
}

export function CategoryNav({ categories }: { categories: MenuCategory[] }) {
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const [listOpen, setListOpen] = useState(false);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-category-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top);
          else visible.delete(id);
        }
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActiveId(top[0]);
      },
      { rootMargin: "-112px 0px -60% 0px", threshold: 0 },
    );
    for (const category of categories) {
      const section = document.getElementById(categoryAnchorId(category.id));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    if (!activeId) return;
    linkRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  if (categories.length === 0) return null;

  return (
    <>
      <nav
        aria-label="Categorias"
        className="sticky top-0 z-10 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]"
      >
        <div className="mx-auto flex max-w-3xl items-center md:px-4">
          <ul className="foode-carousel flex min-w-0 flex-1 gap-1 overflow-x-auto px-2" role="list">
            {categories.map((category) => {
              const current = category.id === activeId;
              return (
                <li className="shrink-0" key={category.id}>
                  <a
                    aria-current={current ? "true" : undefined}
                    className={[
                      "flex min-h-12 items-center border-b-2 px-3 text-sm font-bold",
                      current
                        ? "border-[var(--color-primary)] text-[var(--color-primary-strong)]"
                        : "border-transparent text-[var(--color-body)]",
                    ].join(" ")}
                    href={`#${categoryAnchorId(category.id)}`}
                    onClick={() => setActiveId(category.id)}
                    ref={(node) => {
                      if (node) linkRefs.current.set(category.id, node);
                      else linkRefs.current.delete(category.id);
                    }}
                  >
                    {category.name}
                  </a>
                </li>
              );
            })}
          </ul>
          <button
            aria-label="Todas as categorias"
            className="foode-icon-button mr-1 shrink-0"
            onClick={() => setListOpen(true)}
            type="button"
          >
            <List aria-hidden size={20} weight="bold" />
          </button>
        </div>
      </nav>
      <Sheet
        labelledBy="categorias-sheet-title"
        onClose={() => setListOpen(false)}
        open={listOpen}
        title="Categorias"
      >
        <ul className="grid gap-1" role="list">
          {categories.map((category) => (
            <li key={category.id}>
              <a
                className="flex min-h-12 items-center justify-between rounded-xl px-3 font-bold text-[var(--color-ink)] hover:bg-[var(--color-primary-soft)]"
                href={`#${categoryAnchorId(category.id)}`}
                onClick={() => {
                  setActiveId(category.id);
                  setListOpen(false);
                }}
              >
                {category.name}
                <span className="text-sm font-normal text-[var(--color-muted)]">
                  {category.items.length}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
