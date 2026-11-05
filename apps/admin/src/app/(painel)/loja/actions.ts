"use server";

import { switchActiveStoreInputSchema } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { homeFor } from "../../../lib/access";
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
