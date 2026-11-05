"use server";

// Server actions dos lotes de repasse (Ticket 14; OPS-04): validam com o Zod do contrato, chamam
// a RPC pelo binding `API` e devolvem `FormState` para `useActionState`. A api valida, autoriza
// (`ops.area`) e audita de novo. Lote pago é imutável: correção só por ajuste.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MARK_PAID_CONFLICT_MESSAGE,
  type MarkPaidState,
  parseAdjustment,
  parseMarkPaid,
} from "../../../../lib/finance-forms";
import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../../lib/ops-labels";
import { formatCents } from "../../../../lib/ops-format";
import { opsRpc } from "../../../../lib/ops-rpc";

export async function markPayoutPaid(
  _prev: MarkPaidState,
  formData: FormData,
): Promise<MarkPaidState> {
  const parsed = parseMarkPaid(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsPayoutMarkPaid(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    if (result.error === "conflict")
      return { ...formError({}, MARK_PAID_CONFLICT_MESSAGE), conflict: true };
    return formError({}, RPC_ERROR_MESSAGE[result.error]);
  }
  revalidatePath("/ops/repasses");
  revalidatePath("/repasses");
  const { amountCents, itemCount, replayed } = result.data;
  return formSuccess(
    replayed
      ? `Este lote já estava marcado como pago (${formatCents(amountCents)}). Nada foi pago de novo.`
      : `Lote pago: ${formatCents(amountCents)} em ${itemCount} ${itemCount === 1 ? "item" : "itens"}. O Dono já vê como Pago em Repasses.`,
  );
}

export async function createPayoutAdjustment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseAdjustment(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsPayoutAdjustmentCreate(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    if (result.error === "not_found")
      return formError({ batchId: "Este lote não existe para esta Loja." });
    return formError({}, RPC_ERROR_MESSAGE[result.error]);
  }
  revalidatePath("/ops/repasses");
  revalidatePath("/repasses");
  const amount = parsed.data.amountCents;
  return formSuccess(
    `Ajuste de ${amount < 0 ? "− " : "+ "}${formatCents(Math.abs(amount))} lançado. Entra no próximo lote da Loja e fica na auditoria.`,
  );
}
