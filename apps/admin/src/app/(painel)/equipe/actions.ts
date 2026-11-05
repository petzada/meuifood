"use server";

// Equipe do Dono (feedback do Dono, item 9; EQP-01): convidar Operador por e-mail (Turnstile +
// rate limit na api, contrato do Ticket 22) e remover acesso. A api confere `store.members` de
// novo e usa a Loja ATIVA da sessão — nunca um id de Loja do formulário.
import {
  inviteMemberInputSchema,
  removeMemberInputSchema,
  resendInviteInputSchema,
} from "@foode/shared/auth";
import type { AuthErrorCode } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type FieldErrors,
  formError,
  formSuccess,
  type FormState,
  parseWith,
  text,
} from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";

export type TeamAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function failure(error: AuthErrorCode, messages: Partial<Record<AuthErrorCode, string>> = {}) {
  if (error === "unauthenticated") redirect("/entrar");
  return formError({}, messages[error] ?? RPC_ERROR_MESSAGE[error]);
}

export const inviteOperator: TeamAction = async (_prev, formData) => {
  const parsed = parseWith(inviteMemberInputSchema, {
    email: text(formData, "email").trim(),
    name: text(formData, "name").trim() || undefined,
    role: "operator",
    turnstileToken: text(formData, "turnstileToken"),
  });
  if (!parsed.ok) {
    const errors: FieldErrors = {};
    if (parsed.errors.email) errors.email = "Informe um e-mail válido.";
    if (parsed.errors.name) errors.name = "Nome com até 120 caracteres.";
    if (parsed.errors.turnstileToken) errors.form = "Aguarde a verificação de segurança terminar.";
    return formError(errors);
  }
  const result = await painelRpc((api, caller) => api.inviteMember(caller, parsed.data));
  if (!result.ok) {
    return failure(result.error, {
      invalid_input: "Não foi possível convidar este e-mail.",
      conflict: "Este e-mail já faz parte da equipe.",
    });
  }
  revalidatePath("/equipe");
  return formSuccess(`Convite enviado para ${parsed.data.email}.`);
};

export const removeMember: TeamAction = async (_prev, formData) => {
  const parsed = removeMemberInputSchema.safeParse({
    membershipId: text(formData, "membershipId"),
  });
  if (!parsed.success) return formError({}, "Membro inválido. Recarregue a página.");
  const name = text(formData, "name");
  const result = await painelRpc((api, caller) => api.removeMember(caller, parsed.data));
  if (!result.ok) {
    return failure(result.error, {
      conflict: "Você não pode remover o próprio acesso.",
      not_found: "Este membro já não faz parte da equipe.",
    });
  }
  revalidatePath("/equipe");
  return formSuccess(`${name || "O membro"} não tem mais acesso à Loja.`);
};

export const resendInvite: TeamAction = async (_prev, formData) => {
  const parsed = resendInviteInputSchema.safeParse({
    membershipId: text(formData, "membershipId"),
  });
  if (!parsed.success) return formError({}, "Membro inválido. Recarregue a página.");
  const name = text(formData, "name");
  const result = await painelRpc((api, caller) => api.resendInvite(caller, parsed.data));
  if (!result.ok) {
    return failure(result.error, {
      conflict: `${name || "Este membro"} já definiu a senha e está ativo.`,
      not_found: "Este membro já não faz parte da equipe.",
      rate_limited: "Convite reenviado há pouco. Aguarde alguns minutos para reenviar de novo.",
    });
  }
  revalidatePath("/equipe");
  return formSuccess(`Convite reenviado para ${name || "o membro"}.`);
};
