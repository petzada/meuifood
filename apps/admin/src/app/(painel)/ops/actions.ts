"use server";

// Server actions da área Ops (Ticket 29). Cada uma: valida com o Zod do contrato
// (erro no campo certo), chama a RPC pelo binding `API` com `{cookie, ip}` e devolve
// `FormState` para `useActionState` (ou redireciona). A api valida e autoriza de novo.
import { opsInviteOwnerInputSchema } from "@foode/shared/auth";
import type { AuthErrorCode } from "@foode/shared/auth";
import { RESERVED_STORE_SLUGS, SLUG_PATTERN } from "@foode/shared/ops";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseCustomerChangePhone, parseCustomerFind } from "../../../lib/customer-forms";
import type { CustomerFindState } from "./_components/customer-finder";
import {
  formError,
  formSuccess,
  parseActivateStore,
  parseCreatePaymentFee,
  parseCreateProviderCost,
  parseCreateStore,
  parseEndPaymentFee,
  parseEndProviderCost,
  parsePublishPlanTiers,
  parseSetCardMode,
  parseSetStorePlan,
  parseSuspendStore,
  parseUpdateStore,
  parseWith,
  text,
  type FieldErrors,
  type FormState,
} from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { opsRpc } from "../../../lib/ops-rpc";
import { formatDateTimeSp } from "../../../lib/ops-format";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Erro da RPC → estado do formulário: no campo quando se sabe qual, senão no topo. */
function rpcFailure(
  error: AuthErrorCode,
  specific: Partial<Record<AuthErrorCode, { field?: string; message: string }>> = {},
): FormState {
  if (error === "unauthenticated") redirect("/entrar");
  const hit = specific[error];
  if (hit?.field) return formError({ [hit.field]: hit.message });
  return formError({}, hit?.message ?? RPC_ERROR_MESSAGE[error]);
}

const storePath = (storeId: string) => `/ops/lojas/${storeId}`;

function revalidateStore(storeId: string) {
  revalidatePath("/ops");
  revalidatePath(storePath(storeId));
}

// ---- Lojas ----

export const createStore: Action = async (_prev, formData) => {
  const parsed = parseCreateStore(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsCreateStore(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { field: "slug", message: "Este link já pertence a outra Loja." },
    });
  }
  revalidatePath("/ops");
  redirect(`${storePath(result.data.storeId)}?aviso=loja-criada`);
};

export const updateStore: Action = async (_prev, formData) => {
  const storeId = text(formData, "storeId");
  const parsed = parseUpdateStore(formData, storeId);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsUpdateStore(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { field: "slug", message: "Este link já pertence a outra Loja." },
      not_found: { message: "Esta Loja não existe mais." },
    });
  }
  revalidateStore(storeId);
  return formSuccess("Alterações salvas.");
};

export const activateStore: Action = async (_prev, formData) => {
  const parsed = parseActivateStore(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsActivateStore(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        message:
          "Não foi possível ativar: a Loja precisa de cadastro completo, Dono convidado e Plano vigente, e não pode já estar ativa.",
      },
    });
  }
  revalidateStore(parsed.data.storeId);
  revalidatePath("/", "layout");
  return formSuccess("Loja ativada. Ela já pode receber Pedidos.");
};

export const suspendStore: Action = async (_prev, formData) => {
  const parsed = parseSuspendStore(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsSuspendStore(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { message: "A Loja já está suspensa." },
    });
  }
  revalidateStore(parsed.data.storeId);
  revalidatePath("/", "layout");
  return formSuccess("Loja suspensa. Ela parou de aceitar Pedidos.");
};

export const setCardMode: Action = async (_prev, formData) => {
  const parsed = parseSetCardMode(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsSetCardMode(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateStore(parsed.data.storeId);
  return formSuccess("Modo do cartão salvo. Cobranças anteriores não mudam.");
};

export const setStorePlan: Action = async (_prev, formData) => {
  const parsed = parseSetStorePlan(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsSetStorePlan(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        field: "validFrom",
        message: "Já existe um Plano começando depois desta data. Escolha um início posterior.",
      },
    });
  }
  revalidateStore(parsed.data.storeId);
  return formSuccess(`Plano salvo, vale a partir de ${formatDateTimeSp(parsed.data.validFrom)}.`);
};

/** Convite e reenvio do Dono: a mesma RPC; usuário já existente só recebe aviso por e-mail. */
export const inviteOwner: Action = async (_prev, formData) => {
  const parsed = parseWith(opsInviteOwnerInputSchema, {
    storeId: text(formData, "storeId"),
    email: text(formData, "email"),
    name: text(formData, "name").trim() || undefined,
    turnstileToken: text(formData, "turnstileToken"),
  });
  if (!parsed.ok) {
    const errors: FieldErrors = { ...parsed.errors };
    if (errors.email) errors.email = "Informe um e-mail válido.";
    if (errors.turnstileToken) errors.form = "Aguarde a verificação de segurança terminar.";
    return formError(errors);
  }
  const result = await opsRpc((api, caller) => api.opsInviteOwner(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      not_found: { message: "Esta Loja não existe mais." },
      invalid_input: { field: "email", message: "Não foi possível convidar este e-mail." },
    });
  }
  revalidateStore(parsed.data.storeId);
  return formSuccess(`Convite enviado para ${parsed.data.email}.`);
};

/** Disponibilidade do Slug enquanto digita (OPS-03): formato, reservados e Lojas existentes. */
export async function checkSlug(
  slug: string,
  currentStoreId: string | null,
): Promise<"available" | "taken" | "invalid" | "unknown"> {
  const value = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(value) || RESERVED_STORE_SLUGS.includes(value)) return "invalid";
  const result = await opsRpc((api, caller) => api.opsListStores(caller));
  if (!result.ok) return "unknown";
  const taken = result.data.some((store) => store.slug === value && store.id !== currentStoreId);
  return taken ? "taken" : "available";
}

// ---- Faixas ----

export const publishPlanTiers: Action = async (_prev, formData) => {
  const parsed = parsePublishPlanTiers(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsPublishPlanTiers(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        field: "validFrom",
        message: "Já existe uma tabela começando nesta data ou depois. Escolha outro início.",
      },
    });
  }
  revalidatePath("/ops/faixas");
  revalidatePath("/ops");
  return formSuccess(
    `Tabela publicada, vale a partir de ${formatDateTimeSp(parsed.data.validFrom)}.`,
  );
};

// ---- Taxas Foode ----

export const createPaymentFee: Action = async (_prev, formData) => {
  const storeId = text(formData, "storeId").trim() || null;
  const parsed = parseCreatePaymentFee(formData, storeId);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsCreatePaymentFees(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        field: "validFrom",
        message:
          "A vigência sobrepõe outra taxa do mesmo meio/modo. Encerre a anterior ou ajuste as datas.",
      },
    });
  }
  if (storeId) revalidateStore(storeId);
  else revalidatePath("/ops/taxas");
  const fee = parsed.data.fees[0]!;
  return formSuccess(`Taxa cadastrada, vale a partir de ${formatDateTimeSp(fee.validFrom)}.`);
};

export const endPaymentFee: Action = async (_prev, formData) => {
  const storeId = text(formData, "storeId").trim() || null;
  const parsed = parseEndPaymentFee(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsEndPaymentFee(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { field: "validTo", message: "O fim deve ser depois do início da vigência." },
      not_found: { message: "Esta taxa não existe mais." },
    });
  }
  if (storeId) revalidateStore(storeId);
  else revalidatePath("/ops/taxas");
  return formSuccess(`Vigência encerrada em ${formatDateTimeSp(parsed.data.validTo)}.`);
};

// ---- Custos dos provedores ----

export const createProviderCost: Action = async (_prev, formData) => {
  const parsed = parseCreateProviderCost(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsCreateProviderCost(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        field: "validFrom",
        message:
          "A vigência sobrepõe outro custo do mesmo provedor/operação. Encerre o anterior ou ajuste as datas.",
      },
    });
  }
  revalidatePath("/ops/custos");
  return formSuccess(
    `Custo cadastrado, vale a partir de ${formatDateTimeSp(parsed.data.validFrom)}.`,
  );
};

export const endProviderCost: Action = async (_prev, formData) => {
  const parsed = parseEndProviderCost(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsEndProviderCost(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { field: "validTo", message: "O fim deve ser depois do início da vigência." },
      not_found: { message: "Este custo não existe mais." },
    });
  }
  revalidatePath("/ops/custos");
  return formSuccess(`Vigência encerrada em ${formatDateTimeSp(parsed.data.validTo)}.`);
};

// ---- Conta do Consumidor (Ticket 13, decisão 65): busca e troca de telefone auditada ----

export async function findCustomer(
  _prev: CustomerFindState,
  formData: FormData,
): Promise<CustomerFindState> {
  const parsed = parseCustomerFind(formData);
  if (!parsed.ok) return { ...formError(parsed.errors), customer: null };
  const result = await opsRpc((api, caller) => api.opsCustomerFind(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "not_found") {
      return { ...formError({}, "Nenhuma conta com esse dado."), customer: null };
    }
    return { ...rpcFailure(result.error), customer: null };
  }
  return { status: "success", errors: {}, customer: result.data };
}

export const changeCustomerPhone: Action = async (_prev, formData) => {
  const parsed = parseCustomerChangePhone(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await opsRpc((api, caller) => api.opsCustomerChangePhone(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: {
        field: "phone",
        message: "Esse número já pertence a outra conta ou é o atual.",
      },
      not_found: { message: "Esta conta não existe mais. Busque de novo." },
    });
  }
  revalidatePath("/ops/clientes");
  return formSuccess("Telefone trocado. As sessões abertas dessa conta foram encerradas.");
};
