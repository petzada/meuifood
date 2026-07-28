"use client";

import { Button, OutlineContainer } from "@foode/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <OutlineContainer className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">
          Não foi possível carregar o Painel.
        </h1>
        <p className="mt-3 text-[var(--color-body)]">
          Tente novamente. Se o problema continuar, verifique a conexão da Loja.
        </p>
        <Button className="mt-6" onClick={reset}>Tentar novamente</Button>
      </OutlineContainer>
    </main>
  );
}
