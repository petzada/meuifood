// Leitura da área Ops no servidor (RSC): atalhos sobre `painel-rpc.ts` que mantêm a assinatura
// usada pelas páginas Ops. Mutações ficam nas server actions.
import type { PainelCaller, PainelRpc } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";

import { painelRead, painelRpc } from "./painel-rpc";

export const opsRpc = painelRpc;

/**
 * Dados de página: `unauthenticated` → entrar; `forbidden` → home; `not_found` → 404;
 * outro erro vira exceção (error.tsx com "Tentar de novo").
 */
export async function opsRead<T>(
  call: (api: PainelRpc, caller: PainelCaller) => Promise<RpcResult<T>>,
): Promise<T> {
  return painelRead("a área Ops", call);
}
