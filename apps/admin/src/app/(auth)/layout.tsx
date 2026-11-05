import { BrandMark } from "@foode/ui";
import Image from "next/image";
import type { ReactNode } from "react";

import logo from "../../../../../public/images/logo.png";

// Moldura das telas sem sessão (entrar, esqueci a senha, definir senha): marca no topo,
// um container outline por tela, mobile-first.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark className="mx-auto w-fit">
          <Image src={logo} alt="Foode Delivery" width={112} height={112} priority />
        </BrandMark>
        <p className="mt-6 text-center text-sm font-bold text-[var(--color-primary-active)]">
          Painel Foode
        </p>
        {children}
      </div>
    </main>
  );
}
