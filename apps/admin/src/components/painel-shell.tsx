// Moldura do Painel autenticado: marca, navegação guiada pelo papel (lib/access.ts), Loja
// ativa com seletor para quem tem mais de uma, e sair. Presentacional e testável.
//
// PONTO DE EXTENSÃO: entradas novas no menu entram em `ROUTES` (lib/access.ts); conteúdo
// de cabeçalho por área pode vir no slot `aside` se um ticket precisar.
import { BrandMark } from "@foode/ui";
import type { Role, SessionCtx } from "@foode/shared/auth";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import logo from "../../../../public/images/logo.png";
import { navFor } from "../lib/access";
import { SignOutButton } from "./sign-out-button";
import { StoreSwitcher } from "./store-switcher";

const ROLE_LABEL: Record<Role, string> = {
  foode_ops: "Ops Foode",
  owner: "Dono",
  operator: "Operador",
};

export function PainelShell({
  children,
  currentPath,
  role,
  session,
  switchStore,
}: {
  children: ReactNode;
  currentPath: string;
  role: Role;
  session: SessionCtx;
  /** Server action do seletor (ausente nos testes de render). */
  switchStore?: ((formData: FormData) => Promise<void>) | undefined;
}) {
  const nav = navFor(role);
  const showStores = role !== "foode_ops" && session.stores.length > 1;
  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-[var(--color-hairline)] px-4 py-4 md:flex md:flex-col md:border-b-0 md:border-r md:px-6 md:py-7">
        <div className="flex items-center justify-between gap-4 md:block">
          <Link href={nav[0]?.href ?? "/"} aria-label="Início do Painel">
            <BrandMark size="compact">
              <Image src={logo} alt="Foode Delivery" width={96} height={96} priority />
            </BrandMark>
          </Link>
          <p className="text-sm font-bold text-[var(--color-muted)] md:mt-6">Painel Foode</p>
        </div>

        <div className="mt-4 md:mt-6">
          {role === "foode_ops" ? (
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
          ) : null}
        </div>

        <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
          <ul className="flex gap-1 overflow-x-auto md:grid">
            {nav.map((item) => {
              const current =
                item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={
                      current
                        ? "flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-white"
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

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-hairline-soft)] pt-4 md:mt-auto">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--color-ink)]">
              {session.user.name}
            </p>
            <p className="text-xs text-[var(--color-muted)]">{ROLE_LABEL[role]}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="px-4 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
