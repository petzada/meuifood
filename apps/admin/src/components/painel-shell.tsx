// Moldura do Painel autenticado: marca, navegação guiada pelo papel (lib/access.ts), Loja
// ativa com seletor para quem tem mais de uma, status da Loja com Pausa (NAV-04) e sair.
// Operador (um só item no menu) ganha barra superior e a fila em largura total (NAV-03).
// Item ativo do menu pelo `usePathname` (PainelNav), Sair como ícone e, só para o Dono, o banner
// do Plano acima do rodapé (decisão 72). Presentacional e testável.
//
// PONTO DE EXTENSÃO: entradas novas no menu entram em `ROUTES` (lib/access.ts); conteúdo
// de cabeçalho por área pode vir no slot `aside` se um ticket precisar.
import { BrandMark } from "@foode/ui";
import type { Role, SessionCtx } from "@foode/shared/auth";
import { can } from "@foode/shared/auth";
import type { OwnerPlanView } from "@foode/shared/onboarding";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import logo from "../../../../public/images/logo.png";
import { navFor, navSectionsFor } from "../lib/access";
import { PainelNav } from "./painel-nav";
import { PlanBanner } from "./plan-banner";
import { SignOutButton } from "./sign-out-button";
import { type SetPause, StoreStatusControl, type StoreStatusView, PauseBand } from "./store-status";
import { StoreSwitcher } from "./store-switcher";

const ROLE_LABEL: Record<Role, string> = {
  foode_ops: "Ops Foode",
  owner: "Dono",
  operator: "Operador",
};

export function PainelShell({
  children,
  currentPath,
  plan = null,
  role,
  session,
  setPause,
  storeStatus = null,
  switchStore,
}: {
  children: ReactNode;
  currentPath: string;
  /** Plano do Dono para o banner da sidebar (null: Operador/Ops ou a api não respondeu). */
  plan?: OwnerPlanView | null;
  role: Role;
  session: SessionCtx;
  /** Server action da Pausa (ausente nos testes de render). */
  setPause?: SetPause | undefined;
  /** Estado da Loja ativa (null para Ops ou quando a api não respondeu). */
  storeStatus?: StoreStatusView | null;
  /** Server action do seletor (ausente nos testes de render). */
  switchStore?: ((formData: FormData) => Promise<void>) | undefined;
}) {
  const nav = navFor(role);
  const sections = navSectionsFor(role);
  const showStores = role !== "foode_ops" && session.stores.length > 1;
  const canPause = can(role, "store.pause");
  const compact = role !== "foode_ops" && nav.length <= 1;

  const brand = (
    <Link href={nav[0]?.href ?? "/"} aria-label="Início do Painel">
      <BrandMark size="compact">
        <Image src={logo} alt="Foode Delivery" width={96} height={96} priority />
      </BrandMark>
    </Link>
  );

  const storeBlock =
    role === "foode_ops" ? (
      <p className="text-sm font-bold text-[var(--color-ink)]">Área Ops</p>
    ) : showStores && switchStore ? (
      <StoreSwitcher
        action={switchStore}
        activeStoreId={session.activeStore?.id ?? null}
        stores={session.stores}
      />
    ) : session.activeStore ? (
      <p className="truncate text-sm font-bold text-[var(--color-ink)]">
        {session.activeStore.name}
      </p>
    ) : null;

  const status = storeStatus ? (
    <StoreStatusControl canPause={canPause} setPause={setPause} status={storeStatus} />
  ) : null;

  const user = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--color-ink)]">{session.user.name}</p>
        <p className="text-xs text-[var(--color-muted)]">{ROLE_LABEL[role]}</p>
      </div>
      <SignOutButton />
    </div>
  );

  const band = storeStatus ? (
    <PauseBand canPause={canPause} pause={storeStatus.pause} setPause={setPause} />
  ) : null;

  if (compact) {
    return (
      <div className="min-h-[100dvh]">
        <header className="border-b border-[var(--color-hairline)] px-4 py-3 md:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {brand}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              {storeBlock}
              {status}
            </div>
            <PainelNav compact initialPath={currentPath} items={nav} />
            {user}
          </div>
        </header>
        {band}
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-[var(--color-hairline)] px-4 py-4 md:flex md:flex-col md:border-b-0 md:border-r md:px-6 md:py-7">
        <div className="flex items-center justify-between gap-4 md:block">
          {brand}
          <p className="text-sm font-bold text-[var(--color-muted)] md:mt-6">Painel Foode</p>
        </div>

        <div className="mt-4 space-y-3 md:mt-6">
          {storeBlock}
          {status}
        </div>

        <PainelNav initialPath={currentPath} items={nav} sections={sections} />

        {role === "owner" && plan ? (
          <div className="mt-6 md:mt-auto md:pt-6">
            <PlanBanner plan={plan} />
          </div>
        ) : null}

        <div
          className={`mt-4 border-t border-[var(--color-hairline-soft)] pt-4 ${role === "owner" && plan ? "md:mt-4" : "md:mt-auto"}`}
        >
          {user}
        </div>
      </aside>

      <div className="min-w-0">
        {band}
        <main className="px-4 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}
