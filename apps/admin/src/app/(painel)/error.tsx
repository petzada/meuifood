"use client";

import { Button, OutlineContainer } from "@foode/ui";

// Erro de carregamento de uma tela do Painel (T-04), dentro da moldura: a sidebar continua e o
// Dono tenta de novo sem perder a navegação. Cardápio e Ops têm o próprio texto.
export default function PainelError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-6xl">
      <OutlineContainer className="max-w-md p-6" role="alert">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">
          Não foi possível carregar esta tela.
        </h1>
        <p className="mt-3 text-[var(--color-body)]">
          A api não respondeu a tempo. Tente de novo; se continuar, confira a conexão da Loja.
        </p>
        <Button className="mt-6" onClick={reset}>
          Tentar de novo
        </Button>
      </OutlineContainer>
    </section>
  );
}
