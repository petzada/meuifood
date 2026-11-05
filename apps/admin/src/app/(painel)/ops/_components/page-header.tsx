// Cabeçalho das páginas Ops (NAV-06: título sempre; breadcrumb só no 3º nível).
import Link from "next/link";
import type { ReactNode } from "react";

export function OpsPageHeader({
  actions,
  crumbs,
  description,
  title,
}: {
  actions?: ReactNode;
  /** Só no 3º nível (ex.: Lojas › Nome da Loja). */
  crumbs?: { href: string; label: string }[];
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Caminho" className="text-sm font-bold text-[var(--color-muted)]">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  <Link
                    href={crumb.href}
                    className="underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
                  >
                    {crumb.label}
                  </Link>
                  <span aria-hidden="true">›</span>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <p className="text-sm font-bold text-[var(--color-muted)]">Ops Foode</p>
        )}
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}
