"use server";

import { switchActiveStoreInputSchema } from "@foode/shared/auth";
import { type PauseState, storeSetPauseInputSchema } from "@foode/shared/order";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { homeFor } from "../../../lib/access";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelApi } from "../../../lib/painel-api";
import { painelCaller } from "../../../lib/session";

/** Troca a Loja ativa pelo seletor; a api confere a membership (`switchActiveStore`). */
export async function switchStore(formData: FormData) {
  const input = switchActiveStoreInputSchema.safeParse({ storeId: formData.get("storeId") });
  if (!input.success) redirect("/selecionar-loja?aviso=loja-invalida");

  const result = await (await painelApi()).switchActiveStore(await painelCaller(), input.data);
  if (!result.ok) {
    redirect(result.error === "unauthenticated" ? "/entrar" : "/selecionar-loja?aviso=sem-acesso");
  }
  revalidatePath("/", "layout");
  redirect(homeFor(result.data.role));
}

export type PauseActionResult = { ok: true; pause: PauseState } | { ok: false; message: string };

/**
 * Liga ou retoma a Pausa (P-OPE-4: Dono e Operador). A api audita quem e o papel; o shell e
 * Horários releem o estado no próximo render (`revalidatePath` do layout inteiro).
 */
export async function setPause(paused: boolean): Promise<PauseActionResult> {
  const input = storeSetPauseInputSchema.safeParse({ paused });
  if (!input.success) return { ok: false, message: RPC_ERROR_MESSAGE.invalid_input };
  const result = await (await painelApi()).storeSetPause(await painelCaller(), input.data);
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    return { ok: false, message: RPC_ERROR_MESSAGE[result.error] };
  }
  revalidatePath("/", "layout");
  return { ok: true, pause: result.data };
}
