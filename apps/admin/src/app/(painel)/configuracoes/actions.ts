"use server";

// Server actions das Configurações (Ticket 24b, só o Dono): cada seção salva sozinha (T-07).
// Validam com o Zod do contrato (erro no campo certo), chamam a RPC pelo binding `API` e
// devolvem `FormState` para `useActionState`. A api confere `store.settings` de novo.
import type { AuthErrorCode } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  if (!parsed.ok) return formError(parsed.errors, "Confira os períodos destacados.");
  const result = await painelRpc((api, caller) => api.storeSetHours(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess("Horários salvos.");
};

export const saveFulfillment: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetFulfillment(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
  const result = await painelRpc((api, caller) => api.storeSetFulfillment(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateSettings();
  return formSuccess("Entrega salva.");
};

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
