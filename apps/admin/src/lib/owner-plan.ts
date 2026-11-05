// Plano do Dono para o banner da sidebar e `/plano` (decisão 72). Só o Dono lê (a api confere
// `store.settings` de novo); falha da api = sem banner, o Painel segue utilizável.
import type { OwnerPlanView } from "@foode/shared/onboarding";
import { can } from "@foode/shared/auth";

import { painelRpc } from "./painel-rpc";
import type { PainelSession } from "./session";

export async function loadOwnerPlan(session: PainelSession): Promise<OwnerPlanView | null> {
  if (!session.activeStore || !can(session.role, "store.settings")) return null;
  try {
    const result = await painelRpc((api, caller) => api.storePlanGet(caller));
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}
