import { Button, OutlineContainer } from "@foode/ui";

import { definePassword } from "./actions";

type PasswordPageProps = { searchParams: Promise<{ erro?: string }> };

export default async function PasswordPage({ searchParams }: PasswordPageProps) {
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <OutlineContainer className="w-full max-w-md p-6">
        <p className="text-sm font-bold text-[var(--color-primary-active)]">Convite aceito</p>
        <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Defina sua senha do Painel.
        </h1>
        <form action={definePassword} className="mt-6 space-y-5">
          <label className="block text-sm font-bold text-[var(--color-ink)]">
            Nova senha
            <input
              className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          {erro ? <p role="alert" className="text-sm">Use pelo menos 12 caracteres.</p> : null}
          <Button type="submit" className="w-full">Salvar senha e entrar</Button>
        </form>
      </OutlineContainer>
    </main>
  );
}
