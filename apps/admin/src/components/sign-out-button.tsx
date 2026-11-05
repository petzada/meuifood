"use client";

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
      className="foode-button foode-button--secondary min-h-10 shrink-0 px-4 py-2 text-sm"
    >
      {pending ? "Saindo..." : "Sair"}
    </button>
  );
}
