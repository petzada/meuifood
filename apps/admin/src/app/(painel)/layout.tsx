import { headers } from "next/headers";
import type { ReactNode } from "react";

import { PainelShell } from "../../components/painel-shell";
import { PATHNAME_HEADER } from "../../lib/access";
import { requireSession } from "../../lib/session";
import { switchStore } from "./loja/actions";

// Layout do Painel autenticado com papel resolvido. O middleware já barrou quem não pode;
// aqui a sessão é lida de novo (defesa em profundidade) e alimenta navegação e seletor.
export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireSession();
  const currentPath = (await headers()).get(PATHNAME_HEADER) ?? "/";
  return (
    <PainelShell
      currentPath={currentPath}
      role={session.role}
      session={session}
      switchStore={switchStore}
    >
      {children}
    </PainelShell>
  );
}
