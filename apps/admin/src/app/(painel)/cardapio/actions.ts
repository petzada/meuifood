"use server";

// Server actions do Cardápio (Ticket 23). Cada uma: valida com o Zod do contrato (erro no
// campo certo), chama a RPC `menu*` pelo binding `API` com `{cookie, ip}` e devolve `FormState`
// para `useActionState` (ou redireciona). A api valida e autoriza de novo (só o Dono).
import type { AuthErrorCode } from "@foode/shared/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  checkMenuImageFile,
  parseCopyComplementGroups,
  parseCreateAdditional,
  parseCreateCategory,
  parseCreateComplementGroup,
  parseCreateItem,
  parseDeleteAdditional,
  parseDeleteCategory,
  parseDeleteComplementGroup,
  parseDeleteItem,
  parseRenameCategory,
  parseReorderAdditionals,
  parseReorderCategories,
  parseReorderComplementGroups,
  parseReorderItems,
  parseSetAdditionalAvailable,
  parseSetCategoryAvailable,
  parseSetItemAvailable,
  parseSetItemPrice,
  parseUpdateAdditional,
  parseUpdateComplementGroup,
  parseUpdateItem,
  type UploadResult,
} from "../../../lib/menu-forms";
import { availabilityLabel, MENU_CONFLICT_MESSAGES, NEW_CATEGORY } from "../../../lib/menu-labels";
import { formError, formSuccess, text, type FormState } from "../../../lib/ops-forms";
import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";
import { formatBRL } from "@foode/shared/money";

export type MenuAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Resultado de cadastro no modal: o id criado volta para o cliente (etapas, foco, Toast). */
export type CreatedState = FormState & { categoryId?: string; itemId?: string };

/** id fictício só para validar os campos do item antes de criar a categoria nova. */
const PROBE_CATEGORY_ID = "00000000-0000-4000-8000-000000000000";

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

const CARDAPIO = "/cardapio";
const categoryPath = (categoryId: string) => `${CARDAPIO}?categoria=${categoryId}`;

function revalidateMenu() {
  revalidatePath(CARDAPIO, "layout");
}

const REORDER_CONFLICT = { conflict: { message: MENU_CONFLICT_MESSAGES.reorder } } as const;
const GONE = (what: string) => ({ not_found: { message: `${what} não existe mais.` } });

// ---- Categorias ----

/**
 * Cadastro de categoria no modal (decisão 74): devolve o id para o Painel abrir a categoria nova
 * e mostrar o Toast; não redireciona (o modal fecha do lado do cliente).
 */
export const createCategory: MenuAction = async (_prev, formData) => {
  const parsed = parseCreateCategory(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuCreateCategory(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error);
  revalidateMenu();
  const state: CreatedState = {
    ...formSuccess(`Categoria ${parsed.data.name} criada.`),
    categoryId: result.data.categoryId,
  };
  return state;
};

export const renameCategory: MenuAction = async (_prev, formData) => {
  const parsed = parseRenameCategory(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateCategory(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Esta categoria"));
  revalidateMenu();
  return formSuccess("Nome da categoria salvo.");
};

export const setCategoryAvailable: MenuAction = async (_prev, formData) => {
  const parsed = parseSetCategoryAvailable(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateCategory(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Esta categoria"));
  revalidateMenu();
  return formSuccess(
    `${text(formData, "label") || "Categoria"}: ${availabilityLabel(parsed.data.available ?? true).toLowerCase()}.`,
  );
};

export const deleteCategory: MenuAction = async (_prev, formData) => {
  const parsed = parseDeleteCategory(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuDeleteCategory(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { message: MENU_CONFLICT_MESSAGES.categoryHasItems },
      ...GONE("Esta categoria"),
    });
  }
  revalidateMenu();
  redirect(`${CARDAPIO}?aviso=categoria-apagada`);
};

export const reorderCategories: MenuAction = async (_prev, formData) => {
  const parsed = parseReorderCategories(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuReorderCategories(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, REORDER_CONFLICT);
  revalidateMenu();
  return formSuccess("Ordem das categorias salva.");
};

// ---- Itens ----

const ITEM_FAILURES = {
  conflict: { field: "featured", message: MENU_CONFLICT_MESSAGES.featured },
  invalid_input: {
    field: "imageObjectKey",
    message: "A foto não foi encontrada. Envie a imagem de novo.",
  },
} as const;

/**
 * Etapa "Dados" do cadastro de item no modal (decisão 74). Sem `itemId`: cria o item (e, se
 * pedido, a categoria nova junto — o 1º item do onboarding não exige criar a categoria antes) e
 * devolve o id para as etapas Complementos/Adicionais. Com `itemId` (Voltar à etapa, aba Dados da
 * edição): salva as alterações. Os campos do item são validados ANTES de criar a categoria.
 */
export const saveItemDraft: MenuAction = async (_prev, formData) => {
  const itemId = text(formData, "itemId").trim();
  if (itemId) {
    const parsed = parseUpdateItem(formData);
    if (!parsed.ok) return formError(parsed.errors);
    const result = await painelRpc((api, caller) => api.menuUpdateItem(caller, parsed.data));
    if (!result.ok) return rpcFailure(result.error, { ...ITEM_FAILURES, ...GONE("Este item") });
    revalidateMenu();
    const state: CreatedState = {
      ...formSuccess("Alterações do item salvas."),
      itemId,
      ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
    };
    return state;
  }

  let categoryId = text(formData, "categoryId").trim();
  const wantsNewCategory = categoryId === "" || categoryId === NEW_CATEGORY;
  if (wantsNewCategory) {
    const probe = new FormData();
    for (const [key, value] of formData.entries()) probe.append(key, value);
    probe.set("categoryId", PROBE_CATEGORY_ID);
    const fields = parseCreateItem(probe);
    const categoryForm = new FormData();
    categoryForm.set("name", text(formData, "newCategoryName"));
    const category = parseCreateCategory(categoryForm);
    const errors = {
      ...(fields.ok ? {} : fields.errors),
      ...(category.ok ? {} : { newCategoryName: "Informe o nome da categoria (ex.: Lanches)." }),
    };
    if (!fields.ok || !category.ok) return formError(errors);
    const created = await painelRpc((api, caller) => api.menuCreateCategory(caller, category.data));
    if (!created.ok) return rpcFailure(created.error);
    categoryId = created.data.categoryId;
    formData.set("categoryId", categoryId);
  }

  const parsed = parseCreateItem(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuCreateItem(caller, parsed.data));
  if (!result.ok) {
    if (wantsNewCategory) revalidateMenu();
    return rpcFailure(result.error, { ...ITEM_FAILURES, ...GONE("A categoria") });
  }
  revalidateMenu();
  const state: CreatedState = {
    ...formSuccess(`${parsed.data.name} criado.`),
    categoryId,
    itemId: result.data.itemId,
  };
  return state;
};

/** Preço inline (P-CAR-5, CAR-03): só grava no Enter ou no ✓ da tela. */
export const setItemPrice: MenuAction = async (_prev, formData) => {
  const parsed = parseSetItemPrice(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateItem(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este item"));
  revalidateMenu();
  return formSuccess(`Preço salvo: ${formatBRL(parsed.data.priceCents ?? 0)}.`);
};

/** Disponibilidade inline (CAR-02): salva na hora com feedback de estado. */
export const setItemAvailable: MenuAction = async (_prev, formData) => {
  const parsed = parseSetItemAvailable(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateItem(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este item"));
  revalidateMenu();
  return formSuccess(
    `${text(formData, "label") || "Item"}: ${availabilityLabel(parsed.data.available ?? true).toLowerCase()}.`,
  );
};

export const deleteItem: MenuAction = async (_prev, formData) => {
  const parsed = parseDeleteItem(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const categoryId = text(formData, "categoryId");
  const result = await painelRpc((api, caller) => api.menuDeleteItem(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este item"));
  revalidateMenu();
  redirect(`${categoryId ? categoryPath(categoryId) + "&" : CARDAPIO + "?"}aviso=item-apagado`);
};

export const reorderItems: MenuAction = async (_prev, formData) => {
  const parsed = parseReorderItems(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuReorderItems(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, REORDER_CONFLICT);
  revalidateMenu();
  return formSuccess("Ordem dos itens salva.");
};

// ---- Grupos de Complemento ----

export const createComplementGroup: MenuAction = async (_prev, formData) => {
  const parsed = parseCreateComplementGroup(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) =>
    api.menuCreateComplementGroup(caller, parsed.data),
  );
  if (!result.ok) return rpcFailure(result.error, GONE("Este item"));
  revalidateMenu();
  return formSuccess(`Grupo "${parsed.data.name}" criado.`);
};

export const updateComplementGroup: MenuAction = async (_prev, formData) => {
  const parsed = parseUpdateComplementGroup(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) =>
    api.menuUpdateComplementGroup(caller, parsed.data),
  );
  if (!result.ok) {
    return rpcFailure(result.error, {
      invalid_input: {
        field: "minSelect",
        message: "O mínimo não pode ser maior que o número de opções.",
      },
      ...GONE("Este grupo"),
    });
  }
  revalidateMenu();
  return formSuccess(`Grupo "${parsed.data.name ?? ""}" salvo.`.replace(' ""', ""));
};

export const deleteComplementGroup: MenuAction = async (_prev, formData) => {
  const parsed = parseDeleteComplementGroup(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) =>
    api.menuDeleteComplementGroup(caller, parsed.data),
  );
  if (!result.ok) return rpcFailure(result.error, GONE("Este grupo"));
  revalidateMenu();
  return formSuccess("Grupo apagado.");
};

export const reorderComplementGroups: MenuAction = async (_prev, formData) => {
  const parsed = parseReorderComplementGroups(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) =>
    api.menuReorderComplementGroups(caller, parsed.data),
  );
  if (!result.ok) return rpcFailure(result.error, REORDER_CONFLICT);
  revalidateMenu();
  return formSuccess("Ordem dos grupos salva.");
};

/** P-CAR-1: copia grupos de outro item da mesma Loja (com ids novos). */
export const copyComplementGroups: MenuAction = async (_prev, formData) => {
  const parsed = parseCopyComplementGroups(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) =>
    api.menuCopyComplementGroups(caller, parsed.data),
  );
  if (!result.ok) {
    return rpcFailure(result.error, {
      not_found: { field: "sourceItemId", message: "O item de origem não existe mais." },
      invalid_input: {
        field: "groupIds",
        message: "Algum grupo escolhido não pertence mais ao item de origem.",
      },
    });
  }
  revalidateMenu();
  const count = result.data.groupIds.length;
  return formSuccess(`${count} grupo${count === 1 ? "" : "s"} copiado${count === 1 ? "" : "s"}.`);
};

// ---- Adicionais ----

export const createAdditional: MenuAction = async (_prev, formData) => {
  const parsed = parseCreateAdditional(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuCreateAdditional(caller, parsed.data));
  if (!result.ok) {
    return rpcFailure(result.error, {
      conflict: { message: MENU_CONFLICT_MESSAGES.tooManyAdditionals },
      ...GONE("Este item"),
    });
  }
  revalidateMenu();
  return formSuccess(`Adicional "${parsed.data.name}" criado.`);
};

export const updateAdditional: MenuAction = async (_prev, formData) => {
  const parsed = parseUpdateAdditional(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateAdditional(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este Adicional"));
  revalidateMenu();
  return formSuccess("Adicional salvo.");
};

export const setAdditionalAvailable: MenuAction = async (_prev, formData) => {
  const parsed = parseSetAdditionalAvailable(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuUpdateAdditional(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este Adicional"));
  revalidateMenu();
  return formSuccess(
    `${text(formData, "label") || "Adicional"}: ${availabilityLabel(parsed.data.available ?? true).toLowerCase()}.`,
  );
};

export const deleteAdditional: MenuAction = async (_prev, formData) => {
  const parsed = parseDeleteAdditional(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuDeleteAdditional(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, GONE("Este Adicional"));
  revalidateMenu();
  return formSuccess("Adicional apagado.");
};

export const reorderAdditionals: MenuAction = async (_prev, formData) => {
  const parsed = parseReorderAdditionals(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await painelRpc((api, caller) => api.menuReorderAdditionals(caller, parsed.data));
  if (!result.ok) return rpcFailure(result.error, REORDER_CONFLICT);
  revalidateMenu();
  return formSuccess("Ordem dos Adicionais salva.");
};

// ---- Foto (decisão 64: bytes pela RPC, binding MEDIA) ----

/**
 * Recebe o arquivo do navegador, confere tipo/tamanho de novo e repassa os bytes à api, que
 * valida a assinatura, grava no R2 e devolve a chave e a URL pública para a prévia. O campo
 * `imageObjectKey` do item só é gravado quando o Dono salva o formulário.
 */
export async function uploadMenuImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Escolha uma imagem para enviar." };
  const check = checkMenuImageFile(file);
  if (!check.ok) return check;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await painelRpc((api, caller) =>
    api.menuUploadImage(caller, { contentType: check.contentType, bytes }),
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
