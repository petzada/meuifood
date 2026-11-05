"use client";

// Navegação do Painel (feedback do Dono, item 2): o item ativo vem do `usePathname()`, então o
// destaque acompanha a navegação client-side (antes vinha do header do middleware, lido só no
// carregamento do layout, e ficava preso no item da 1ª página). `initialPath` cobre o render sem
// roteador (testes de markup). Com mais de uma seção (Dono: Operação · Loja · Financeiro, NAV-02)
// cada grupo ganha um título; Ops e Operador seguem em lista única.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isCurrentNav, type NavItem, type NavSection } from "../lib/access";

function sectionsOf(items: NavItem[], sections?: NavSection[]): NavSection[] {
  if (sections && sections.length > 0) return sections;
  return [{ group: null, items }];
}

export function PainelNav({
  compact = false,
  initialPath,
  items,
  sections,
}: {
  compact?: boolean;
  initialPath: string;
  items: NavItem[];
  /** Seções do menu (NAV-02); ausente = lista única com `items`. */
  sections?: NavSection[];
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

  const groups = sectionsOf(items, sections);
  const titled = groups.length > 1;

  const renderItem = (item: NavItem) => {
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
  };

  if (!titled) {
    return (
      <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
        <ul className="flex gap-1 overflow-x-auto md:grid">{items.map(renderItem)}</ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
      <div className="flex gap-4 overflow-x-auto md:grid md:gap-5">
        {groups.map((section) => (
          <section
            key={section.group ?? "geral"}
            aria-label={section.group ?? undefined}
            className="shrink-0"
          >
            {section.group ? (
              <p className="mb-1 px-5 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                {section.group}
              </p>
            ) : null}
            <ul className="flex gap-1 md:grid">{section.items.map(renderItem)}</ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
