"use client";

// Cabeçalho compacto da Loja (C1): logo (ou iniciais), nome e "Compartilhar" (P-5.4).
// Logo e capa só aparecem se o contrato trouxer (Ticket 28); sem eles o layout fecha igual.
import { ShareNetwork } from "@phosphor-icons/react";

export type StoreBranding = {
  coverUrl?: string | null;
  logoUrl?: string | null;
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export function StoreHeader({
  branding,
  name,
  onShare,
}: {
  branding?: StoreBranding;
  name: string;
  onShare: () => void;
}) {
  const cover = branding?.coverUrl ?? null;
  const logo = branding?.logoUrl ?? null;

  return (
    <header className="border-b border-[var(--color-hairline)]">
      {cover ? (
        <div className="mx-auto max-w-3xl md:px-8 md:pt-4">
          <img
            alt=""
            className="aspect-[16/6] w-full object-cover md:rounded-[var(--radius-container)] md:border md:border-[var(--color-hairline)]"
            src={cover}
          />
        </div>
      ) : null}
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:px-8">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--color-hairline)] text-lg font-bold text-[var(--color-primary-strong)]"
        >
          {logo ? <img alt="" className="size-full object-cover" src={logo} /> : initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Cardápio
          </p>
          <h1 className="truncate text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
            {name}
          </h1>
        </div>
        <button
          aria-label={`Compartilhar ${name}`}
          className="foode-icon-button"
          onClick={onShare}
          type="button"
        >
          <ShareNetwork aria-hidden size={20} weight="bold" />
        </button>
      </div>
    </header>
  );
}
