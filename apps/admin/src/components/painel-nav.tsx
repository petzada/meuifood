"use client";

// Navegação do Painel (feedback do Dono, item 2): o item ativo vem do `usePathname()`, então o
// destaque acompanha a navegação client-side (antes vinha do header do middleware, lido só no
// carregamento do layout, e ficava preso no item da 1ª página). `initialPath` cobre o render sem
// roteador (testes de markup).
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrentNav, type NavItem } from "../lib/access";

export function PainelNav({
  compact = false,
  initialPath,
  items,
}: {
  compact?: boolean;
  initialPath: string;
  items: NavItem[];
}) {
  const pathname = usePathname() ?? initialPath;

  if (compact) {
    return (
      <nav aria-label="Navegação do Painel" className="sr-only">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrentNav(item.href, pathname) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
      <ul className="flex gap-1 overflow-x-auto md:grid">
        {items.map((item) => {
          const current = isCurrentNav(item.href, pathname);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "flex min-h-11 items-center rounded-full bg-[var(--color-primary-strong)] px-5 text-sm font-bold text-white"
                    : "flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-[var(--color-body)] hover:bg-[var(--color-primary-soft)]"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
