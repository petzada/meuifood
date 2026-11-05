"use server";

// Server action dos leads da landing (Ticket 31, decisão 70): troca o status pelo RPC
// `opsSetLeadStatus` (a api valida e autoriza de novo, só `foode_ops`, e audita).
import { opsSetLeadStatusInputSchema } from "@foode/shared/lead";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../../lib/ops-labels";
import { opsRpc } from "../../../../lib/ops-rpc";

export async function setLeadStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = opsSetLeadStatusInputSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return formError({ status: "Escolha um status válido." });
  const result = await opsRpc((api, caller) => api.opsSetLeadStatus(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    if (result.error === "conflict") {
      return formError({}, "O status mudou enquanto você editava. Recarregue a página.");
    }
    return formError({}, RPC_ERROR_MESSAGE[result.error]);
  }
  revalidatePath("/ops/leads");
  return formSuccess("Status salvo.");
}
