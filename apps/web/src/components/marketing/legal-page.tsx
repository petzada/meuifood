// Moldura das páginas legais: título, vigência, aviso de revisão jurídica e prosa.
import type { ReactNode } from "react";

export function LegalPage({
  children,
  reviewPending = true,
  subtitle,
  title,
  updatedAt,
}: {
  children: ReactNode;
  reviewPending?: boolean;
  subtitle: string;
  title: string;
  updatedAt: string;
}) {
  return (
    <article className="mk-section">
      <div className="mk-container">
        <header className="mx-auto grid max-w-3xl gap-3 border-b border-[var(--color-hairline)] pb-8">
          <p className="mk-eyebrow">Foode Delivery</p>
          <h1 className="mk-h1">{title}</h1>
          <p className="mk-lead">{subtitle}</p>
          <p className="text-sm text-[var(--color-muted)]">
            Última atualização: <time dateTime={updatedAt}>{updatedAt}</time>
          </p>
          {reviewPending ? (
            <p className="foode-outline p-4 text-sm text-[var(--color-body)]" role="note">
              <strong className="text-[var(--color-ink)]">Revisão jurídica pendente:</strong> este
              texto é provisório e será revisado por um advogado antes da publicação definitiva.
            </p>
          ) : null}
        </header>
        <div className="mk-prose mx-auto max-w-3xl">{children}</div>
      </div>
    </article>
  );
}
