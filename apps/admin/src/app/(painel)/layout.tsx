import { headers } from "next/headers";
import type { ReactNode } from "react";

import { PainelShell } from "../../components/painel-shell";
import { PATHNAME_HEADER } from "../../lib/access";
import { loadOwnerPlan } from "../../lib/owner-plan";
import { requireSession } from "../../lib/session";
import { loadStoreStatus } from "../../lib/store-status";
import { setPause, switchStore } from "./loja/actions";

// Layout do Painel autenticado com papel resolvido. O middleware já barrou quem não pode;
// aqui a sessão é lida de novo (defesa em profundidade) e alimenta navegação, seletor, o
// status da Loja com a Pausa (NAV-04) e, para o Dono, o banner do Plano (decisão 72). Status e
// Plano em paralelo; falha de qualquer um só esconde o selo/banner. O caminho do header é só o
// valor inicial: o item ativo do menu acompanha a navegação pelo `usePathname` (PainelNav).
export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireSession();
  const currentPath = (await headers()).get(PATHNAME_HEADER) ?? "/";
  const [storeStatus, plan] = await Promise.all([loadStoreStatus(session), loadOwnerPlan(session)]);
  return (
    <PainelShell
      currentPath={currentPath}
      plan={plan}
      role={session.role}
      session={session}
      setPause={setPause}
      storeStatus={storeStatus}
      switchStore={switchStore}
    >
      {children}
    </PainelShell>
  );
}
