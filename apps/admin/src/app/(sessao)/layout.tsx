import { BrandMark } from "@foode/ui";
import Image from "next/image";
import type { ReactNode } from "react";

import logo from "../../../../../public/images/logo.png";
import { SignOutButton } from "../../components/sign-out-button";

// Telas com sessão mas sem Loja ativa (escolher Loja, sem acesso): sem a navegação do
// Painel, só marca e sair.
export const dynamic = "force-dynamic";

export default function SessaoLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between gap-4">
          <BrandMark>
            <Image src={logo} alt="Foode Delivery" width={112} height={112} priority />
          </BrandMark>
          <SignOutButton />
        </div>
        {children}
      </div>
    </main>
  );
}
