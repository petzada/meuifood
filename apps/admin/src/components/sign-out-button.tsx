"use client";

// Sair (feedback do Dono, item 3): no mesmo lugar (ao lado do nome e da função na sidebar), como
// ícone vermelho de saída com nome acessível "Sair".
import { useState } from "react";

import { signOut } from "../lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  async function onClick() {
    setPending(true);
    await signOut();
    // Com ou sem resposta da api, volta para entrar: o middleware revalida a sessão.
    window.location.assign("/entrar?aviso=saiu");
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Sair"
      title="Sair"
      aria-busy={pending || undefined}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-error)] transition-colors hover:bg-[#fdecea] focus-visible:outline-3 focus-visible:outline-[var(--color-primary-soft)] disabled:opacity-50"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
}
