"use client";

// Cabeçalho compacto da Loja (C1): logo (ou iniciais), nome, linha de estado (aberta até /
// fechada com próximo horário / Pausa — decisão 41) com link "Sobre a Loja", e
// "Compartilhar" (P-5.4). Logo, capa e descrição só aparecem se o contrato trouxer (Ticket 28).
import { Clock, Pause, ShareNetwork, UserCircle } from "@phosphor-icons/react";

import type { StoreAvailabilityView } from "./store-status";

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
  account,
  accountHref,
  availability,
  branding,
  description = null,
  name,
  onAbout,
  onShare,
  onSignIn,
}: {
  /** Conta do Consumidor (Ticket 13): null = anônimo, mostra "Entrar"; ausente = sem conta. */
  account?: { name: string } | null;
  /** Página "Minha conta" desta Loja. */
  accountHref?: string;
  /** Sem estado (api indisponível): só nome e Compartilhar. */
  availability?: StoreAvailabilityView | null;
  branding?: StoreBranding;
  /** Descrição curta da Loja (P-VIS-3), ≤ 160. */
  description?: string | null;
  name: string;
  onAbout?: () => void;
  onShare: () => void;
  onSignIn?: () => void;
}) {
  const cover = branding?.coverUrl ?? null;
  const logo = branding?.logoUrl ?? null;
  const StatusIcon = availability?.kind === "paused" ? Pause : Clock;

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
          {description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-body)]">{description}</p>
          ) : null}
          {availability ? (
            <p
              className={[
                "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm",
                availability.canOrder ? "text-[var(--color-body)]" : "text-[var(--color-ink)]",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-1">
                <StatusIcon
                  aria-hidden
                  className={
                    availability.canOrder
                      ? "text-[var(--color-primary)]"
                      : "text-[var(--color-muted)]"
                  }
                  size={16}
                  weight="bold"
                />
                <span className={availability.canOrder ? "" : "font-bold"}>
                  {availability.label}
                </span>
              </span>
              {onAbout ? (
                <>
                  <span aria-hidden className="text-[var(--color-hairline)]">
                    |
                  </span>
                  <button
                    className="min-h-6 font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
                    onClick={onAbout}
                    type="button"
                  >
                    Sobre a Loja
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {account && accountHref ? (
            <a
              aria-label={`Minha conta: ${account.name}`}
              className="foode-icon-button"
              href={accountHref}
              title="Minha conta"
            >
              <UserCircle aria-hidden size={22} weight="fill" />
            </a>
          ) : account === null && onSignIn ? (
            <button
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[var(--color-hairline)] px-3 text-sm font-bold text-[var(--color-primary-strong)] hover:border-[var(--color-primary)]"
              onClick={onSignIn}
              type="button"
            >
              <UserCircle aria-hidden size={18} weight="bold" />
              Entrar
            </button>
          ) : null}
          <button
            aria-label={`Compartilhar ${name}`}
            className="foode-icon-button"
            onClick={onShare}
            type="button"
          >
            <ShareNetwork aria-hidden size={20} weight="bold" />
          </button>
        </div>
      </div>
    </header>
  );
}
