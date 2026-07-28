import { BrandMark, Button, OutlineContainer } from "@foode/ui";
import Image from "next/image";

import logo from "../../../../../public/images/logo.png";
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ erro?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark className="mx-auto w-fit">
          <Image src={logo} alt="Foode Delivery" width={112} height={112} priority />
        </BrandMark>
        <p className="mt-6 text-center text-sm font-bold text-[var(--color-primary-active)]">
          Painel Foode
        </p>
        <h1 className="mt-2 text-center text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Entre na operação da sua Loja.
        </h1>
        <p className="mt-3 text-center leading-relaxed text-[var(--color-body)]">
          Use o e-mail convidado e sua senha do Painel.
        </p>

        <OutlineContainer className="mt-8 p-6">
          <form action={login} className="space-y-5">
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              E-mail
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Senha
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {erro ? (
              <p role="alert" className="text-sm font-bold text-[var(--color-primary-active)]">
                Não foi possível entrar. Confira suas credenciais e seu acesso à Loja.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Entrar no Painel
            </Button>
          </form>
        </OutlineContainer>
      </div>
    </main>
  );
}
