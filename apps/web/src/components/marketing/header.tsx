"use client";

// Header fixo (PROPOSTA-LANDING §2.1): logo, âncoras, "Entrar" e CTA. Mobile: logo + CTA
// compacto + menu em <dialog> (mesma estética do `.foode-sheet` do Storefront).
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { BrandMark, Button } from "@foode/ui";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import logo from "../../../../../public/images/logo.png";
import { ADMIN_URL, NAV } from "../../content/site";

export function MarketingHeader() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <header className="mk-header" data-mk-header>
      <div className="mk-container flex h-full items-center justify-between gap-3">
        <Link aria-label="Foode Delivery, página inicial" className="mk-header__logo" href="/">
          <BrandMark>
            <Image alt="Foode Delivery" height={120} priority src={logo} width={120} />
          </BrandMark>
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} className="mk-nav-link" href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex">
            <a className="mk-nav-link" href={ADMIN_URL}>
              Entrar
            </a>
          </span>
          <Button className="min-h-11 whitespace-nowrap px-4 text-sm" href="/#contato">
            Falar com a Foode
          </Button>
          <span className="md:hidden">
            <button
              aria-label="Abrir menu"
              className="foode-icon-button"
              onClick={() => dialogRef.current?.showModal()}
              type="button"
            >
              <List aria-hidden size={24} weight="bold" />
            </button>
          </span>
        </div>
      </div>

      <dialog aria-label="Menu" className="foode-sheet" ref={dialogRef}>
        <div className="foode-sheet__panel">
          <div className="foode-sheet__head">
            <span className="font-bold">Menu</span>
            <button
              aria-label="Fechar menu"
              className="foode-icon-button"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              <X aria-hidden size={22} weight="bold" />
            </button>
          </div>
          <nav aria-label="Navegação do menu" className="foode-sheet__body grid gap-1 pb-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                className="mk-nav-link min-h-12 text-base"
                href={item.href}
                onClick={() => dialogRef.current?.close()}
              >
                {item.label}
              </Link>
            ))}
            <a className="mk-nav-link min-h-12 text-base" href={ADMIN_URL}>
              Entrar no painel
            </a>
            <Button className="mt-3" href="/#contato" onClick={() => dialogRef.current?.close()}>
              Falar com a Foode
            </Button>
          </nav>
        </div>
      </dialog>
    </header>
  );
}
