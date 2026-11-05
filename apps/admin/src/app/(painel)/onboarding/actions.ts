"use server";

// Server actions do onboarding do Dono (Ticket 28): perguntas de perfil (uma vez) e o
// "Sua Loja está pronta" visto. A api confere `store.settings` de novo.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseAnswerProfile } from "../../../lib/onboarding-forms";
import { formError, formSuccess, type FormState } from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";

export type OnboardingAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export const answerProfile: OnboardingAction = async (_prev, formData) => {
  const parsed = parseAnswerProfile(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira as respostas destacadas.");
  const result = await painelRpc((api, caller) => api.onboardingAnswerProfile(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    // Já respondido (outra aba): segue para o Painel sem erro.
    if (result.error !== "conflict") return formError({}, RPC_ERROR_MESSAGE[result.error]);
  }
  revalidatePath("/", "layout");
  return formSuccess("Obrigado! Suas respostas ficam só com a equipe Foode.");
};

export async function acknowledgeReady(): Promise<void> {
  const result = await painelRpc((api, caller) => api.onboardingAcknowledgeReady(caller));
  if (!result.ok && result.error === "unauthenticated") redirect("/entrar");
  revalidatePath("/", "layout");
}
