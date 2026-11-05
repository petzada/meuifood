// Leitura da área Ops no servidor (RSC): chama a RPC pelo binding `API` com o caller da
// request e trata os erros de acesso de forma uniforme. Mutações ficam nas server actions.
import type { PainelCaller, PainelRpc } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import { notFound, redirect } from "next/navigation";

import { painelApi } from "./painel-api";
import { painelCaller } from "./session";

export async function opsRpc<T>(
  call: (api: PainelRpc, caller: PainelCaller) => Promise<RpcResult<T>>,
): Promise<RpcResult<T>> {
  return call(await painelApi(), await painelCaller());
}

/**
 * Dados de página: `unauthenticated` → entrar; `forbidden` → home; `not_found` → 404;
 * outro erro vira exceção (error.tsx com "Tentar de novo").
 */
export async function opsRead<T>(
  call: (api: PainelRpc, caller: PainelCaller) => Promise<RpcResult<T>>,
): Promise<T> {
  const result = await opsRpc(call);
  if (result.ok) return result.data;
  if (result.error === "unauthenticated") redirect("/entrar");
  if (result.error === "forbidden") redirect("/");
  if (result.error === "not_found") notFound();
  throw new Error(`Falha ao carregar a área Ops (${result.error}).`);
}
