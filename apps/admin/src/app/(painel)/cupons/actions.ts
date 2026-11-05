"use server";

// Server actions de `/cupons` (Ticket 13, só o Dono): validam com o Zod do contrato (erro no
// campo certo), chamam a RPC pelo binding `API` e devolvem `FormState` para `useActionState`.
// A api confere `store.settings` de novo e audita toda escrita.
import type { AuthErrorCode } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseCouponCreate,
  parseCouponRef,
  parseCouponSetActive,
  parseCouponUpdate,
  parseWelcomeCoupon,
} from "../../../lib/coupon-forms";
import { formError, formSuccess, type FormState } from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";

export type CouponAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const CODE_TAKEN = "Já existe um Cupom com este código nesta Loja.";

function rpcFailure(
  error: AuthErrorCode,
  specific: Partial<Record<AuthErrorCode, { field?: string; message: string }>> = {},
): FormState {
  if (error === "unauthenticated") redirect("/entrar");
  const hit = specific[error];
  if (hit?.field) return formError({ [hit.field]: hit.message });
  return formError({}, hit?.message ?? RPC_ERROR_MESSAGE[error]);
}

function revalidateCoupons() {
  revalidatePath("/cupons");
}

export const createCoupon: CouponAction = async (_prev, formData) => {
  const parsed = parseCouponCreate(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
  const result = await painelRpc((api, caller) => api.couponCreate(caller, parsed.data));
  if (!result.ok)
    return rpcFailure(result.error, { conflict: { field: "code", message: CODE_TAKEN } });
  revalidateCoupons();
  redirect("/cupons?criado=1");
};

export async function updateCoupon(
  couponId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseCouponUpdate(formData, couponId);
  if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
  const result = await painelRpc((api, caller) => api.couponUpdate(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        message:
          "Não foi possível salvar: o código já existe nesta Loja ou o limite ficou abaixo dos usos já feitos.",
      },
    });
  }
  revalidateCoupons();
  revalidatePath(`/cupons/${couponId}`);
  return formSuccess("Cupom salvo.");
}

export const setCouponActive: CouponAction = async (_prev, formData) => {
  const parsed = parseCouponSetActive(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.couponSetActive(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateCoupons();
  return formSuccess(parsed.data.active ? "Cupom ativado." : "Cupom desativado.");
};

export const deleteCoupon: CouponAction = async (_prev, formData) => {
  const parsed = parseCouponRef(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.couponDelete(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { message: "Este Cupom já foi usado: desative em vez de excluir." },
    });
  }
  revalidateCoupons();
  return formSuccess("Cupom excluído.");
};

export const saveWelcomeCoupon: CouponAction = async (_prev, formData) => {
  const parsed = parseWelcomeCoupon(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
  const result = await painelRpc((api, caller) => api.welcomeCouponSet(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateCoupons();
  return formSuccess(
    parsed.data.active
      ? "Cupom de boas-vindas ligado: entra sozinho na primeira compra com conta."
      : "Cupom de boas-vindas desligado.",
  );
};
