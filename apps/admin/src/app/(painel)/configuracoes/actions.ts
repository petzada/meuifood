"use server";

// Server actions das Configurações (Ticket 24b, só o Dono): cada seção salva sozinha (T-07).
// Validam com o Zod do contrato (erro no campo certo), chamam a RPC pelo binding `API` e
// devolvem `FormState` para `useActionState`. A api confere `store.settings` de novo.
import type { AuthErrorCode } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { storeSetDeliveryRateInputSchema } from "@foode/shared/order";

import { formError, formSuccess, type FormState } from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";
import {
  parseSetCardBrands,
  parseSetFulfillment,
  parseSetHours,
  parseSetPrintOnAccept,
} from "../../../lib/settings-forms";

export type SettingsAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function rpcFailure(error: AuthErrorCode): FormState {
  if (error === "unauthenticated") redirect("/entrar");
  return formError({}, RPC_ERROR_MESSAGE[error]);
}

function revalidateSettings() {
  revalidatePath("/", "layout");
}

export const saveHours: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetHours(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetHours(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess("Horários salvos.");
};

export const saveFulfillment: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetFulfillment(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetFulfillment(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess("Entrega salva.");
};

/**
 * R$/km do Delivery (decisão 73, só o Dono): grava na Loja pela RPC `storeSetDeliveryRate`;
 * `null` limpa. Sem revalidar a página: o valor já está na tela que o enviou.
 */
export async function saveDeliveryRate(
  ratePerKmCents: number | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = storeSetDeliveryRateInputSchema.safeParse({ ratePerKmCents });
  if (!parsed.success) return { ok: false, message: "Informe o R$/km (ex.: R$ 1,50)." };
  const result = await painelRpc((api, caller) => api.storeSetDeliveryRate(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    return { ok: false, message: RPC_ERROR_MESSAGE[result.error] };
  }
  return { ok: true };
}

export const saveCardBrands: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetCardBrands(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetCardBrands(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess("Bandeiras salvas.");
};

export const savePrintOnAccept: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetPrintOnAccept(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetPrintOnAccept(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess(
    parsed.data.printOnAccept
      ? "Imprimir ao aceitar ligado: aceitar o Pedido abre a impressão."
      : "Imprimir ao aceitar desligado.",
  );
};
