"use client";

import { Button, OutlineContainer } from "@foode/ui";

// Erro de carregamento da área Ops (T-04): mensagem específica + "Tentar de novo".
export default function OpsError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-6xl">
      <OutlineContainer className="max-w-md p-6" role="alert">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">
          Não foi possível carregar a área Ops.
        </h1>
        <p className="mt-3 text-[var(--color-body)]">
          A api não respondeu. Tente de novo; se continuar, veja o estado do serviço.
        </p>
        <Button className="mt-6" onClick={reset}>
          Tentar de novo
        </Button>
      </OutlineContainer>
    </section>
  );
}
