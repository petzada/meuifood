// Leitura de dados do Painel no servidor (RSC): chama a RPC pelo binding `API` com o caller da
// request e trata os erros de acesso de forma uniforme. Mutações ficam nas server actions de
// cada área (`ops/actions.ts`, `cardapio/actions.ts`).
import type { PainelCaller, PainelRpc } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import { notFound, redirect } from "next/navigation";

import { painelApi } from "./painel-api";
import { painelCaller } from "./session";

export async function painelRpc<T>(
  call: (api: PainelRpc, caller: PainelCaller) => Promise<RpcResult<T>>,
): Promise<RpcResult<T>> {
  return call(await painelApi(), await painelCaller());
}

/**
 * Dados de página: `unauthenticated` → entrar; `forbidden` → home; `not_found` → 404;
 * outro erro vira exceção (error.tsx da área com "Tentar de novo"). `area` nomeia a tela
 * na mensagem da exceção.
 */
export async function painelRead<T>(
  area: string,
  call: (api: PainelRpc, caller: PainelCaller) => Promise<RpcResult<T>>,
): Promise<T> {
  const result = await painelRpc(call);
  if (result.ok) return result.data;
  if (result.error === "unauthenticated") redirect("/entrar");
  if (result.error === "forbidden") redirect("/");
  if (result.error === "not_found") notFound();
  throw new Error(`Falha ao carregar ${area} (${result.error}).`);
}
