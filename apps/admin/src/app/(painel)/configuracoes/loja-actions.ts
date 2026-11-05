"use server";

// Server actions de Dados da Loja e Divulgação (Ticket 28, só o Dono): Link personalizado
// (verificação enquanto digita + gravação), contato, endereço, vitrine (descrição, logo, capa
// pelos bytes) e Pixel. Validam com o Zod do contrato e chamam a RPC pelo binding `API`.
import type { AuthErrorCode } from "@foode/shared/auth";
import type { SlugAvailability } from "@foode/shared/onboarding";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  checkBrandImageFile,
  parseSetAddress,
  parseSetContact,
  parseSetPixels,
  parseSetShowcase,
  parseSetSlug,
  SLUG_TAKEN_MESSAGE,
  type BrandUploadResult,
} from "../../../lib/onboarding-forms";
import { formError, formSuccess, type FormState } from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";
import type { SettingsAction } from "./actions";

function rpcFailure(
  error: AuthErrorCode,
  overrides: Partial<Record<AuthErrorCode, FormState>> = {},
) {
  if (error === "unauthenticated") redirect("/entrar");
  return overrides[error] ?? formError({}, RPC_ERROR_MESSAGE[error]);
}

function revalidateStore() {
  revalidatePath("/", "layout");
}

/** Disponibilidade enquanto digita (não reserva); null = não foi possível verificar agora. */
export async function checkStoreSlug(slug: string): Promise<SlugAvailability | null> {
  const parsed = parseSetSlug({ get: (name) => (name === "slug" ? slug : null), getAll: () => [] });
  if (!parsed.ok) {
    return { slug: slug.trim().toLowerCase(), available: false, reason: "invalid" };
  }
  const result = await painelRpc((api, caller) => api.storeCheckSlug(caller, parsed.data));
  return result.ok ? result.data : null;
}

export const saveSlug: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetSlug(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetSlug(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: formError({ slug: SLUG_TAKEN_MESSAGE }),
      invalid_input: formError({ slug: "Este link não pode ser usado. Escolha outro." }),
    });
  }
  revalidateStore();
  return formSuccess(`Link personalizado salvo: ${result.data.storeUrl}`);
};

export const saveContact: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetContact(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetContact(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateStore();
  return formSuccess("Contato salvo.");
};

export const saveAddress: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetAddress(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira o endereço.");
  const result = await painelRpc((api, caller) => api.storeSetContact(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateStore();
  return formSuccess("Endereço salvo.");
};

export const saveShowcase: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetShowcase(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetShowcase(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateStore();
  return formSuccess("Vitrine salva.");
};

export const savePixels: SettingsAction = async (_prev, formData) => {
  const parsed = parseSetPixels(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.storeSetPixels(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateStore();
  return formSuccess("Pixel salvo.");
};

/** Logo ou capa pelos bytes: tipo e tamanho conferidos aqui, assinatura na api, R2 pelo `MEDIA`. */
export async function uploadBrandImage(formData: FormData): Promise<BrandUploadResult> {
  const file = formData.get("file");
  const kind = formData.get("kind");
  if (!(file instanceof File) || (kind !== "logo" && kind !== "cover")) {
    return { ok: false, message: "Escolha uma imagem para enviar." };
  }
  const check = checkBrandImageFile(file);
  if (!check.ok) return check;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await painelRpc((api, caller) =>
    api.storeUploadBrandImage(caller, { kind, contentType: check.contentType, bytes }),
  );
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    const message =
      result.error === "invalid_input"
        ? "O arquivo não é uma imagem JPEG, PNG ou WebP válida."
        : RPC_ERROR_MESSAGE[result.error];
    return { ok: false, message };
  }
  return { ok: true, objectKey: result.data.objectKey, imageUrl: result.data.imageUrl };
}
