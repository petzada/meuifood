// Estado da Loja ativa para o shell (NAV-04): lê a configuração operacional pela RPC e resolve
// aberta/fechada/Pausa com o módulo de horários do contrato. Falha da api = sem selo (o Painel
// continua utilizável); Ops não tem Loja ativa.
import type { PainelSession } from "./session";
import { storeOpenState, type StoreOperationSettings } from "@foode/shared/order";

import type { StoreStatusView } from "../components/store-status";
import { painelRpc } from "./painel-rpc";

export function statusViewOf(settings: StoreOperationSettings, now = new Date()): StoreStatusView {
  return {
    open: storeOpenState({ now, paused: settings.pause.paused, periods: settings.hours }),
    pause: settings.pause,
  };
}

export async function loadStoreStatus(session: PainelSession): Promise<StoreStatusView | null> {
  if (session.role === "foode_ops" || !session.activeStore) return null;
  try {
    const result = await painelRpc((api, caller) => api.storeOperationGet(caller));
    return result.ok ? statusViewOf(result.data) : null;
  } catch {
    return null;
  }
}
