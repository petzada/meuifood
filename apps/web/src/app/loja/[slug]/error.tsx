"use client";

// Erro de carga do Cardápio (C5/G9): frase curta + "Tentar de novo".
import { Button } from "@foode/ui";
import { useEffect } from "react";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", message: error.message, scope: "storefront" }));
  }, [error]);

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <div className="foode-outline grid gap-4 p-6" role="alert">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
            Não conseguimos abrir o Cardápio agora.
          </h1>
          <p className="max-w-[48ch] text-[var(--color-body)]">
            Pode ser uma instabilidade passageira. Tente de novo em alguns segundos.
          </p>
          <Button className="justify-self-start" onClick={reset}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </main>
  );
}
