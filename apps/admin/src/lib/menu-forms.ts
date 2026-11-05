// Formulários do Cardápio (Ticket 23): lê o FormData do navegador, converte R$ em centavos
// (só pelo helper de `@foode/shared/money`, T-06) e valida com os Zod do contrato
// (`@foode/shared/menu`); a api valida de novo. Puro: roda nas server actions e nos testes.
import {
  MAX_ADDITIONALS_PER_ITEM,
  MAX_COMPLEMENT_OPTIONS,
  MENU_IMAGE_CONTENT_TYPES,
  MENU_IMAGE_MAX_BYTES,
  menuCopyComplementGroupsInputSchema,
  menuCreateAdditionalInputSchema,
  menuCreateCategoryInputSchema,
  menuCreateComplementGroupInputSchema,
  menuCreateItemInputSchema,
  menuDeleteAdditionalInputSchema,
  menuDeleteCategoryInputSchema,
  menuDeleteComplementGroupInputSchema,
  menuDeleteItemInputSchema,
  menuReorderAdditionalsInputSchema,
  menuReorderCategoriesInputSchema,
  menuReorderComplementGroupsInputSchema,
  menuReorderItemsInputSchema,
  menuUpdateAdditionalInputSchema,
  menuUpdateCategoryInputSchema,
  menuUpdateComplementGroupInputSchema,
  menuUpdateItemInputSchema,
  type MenuImageContentType,
} from "@foode/shared/menu";
import { reaisToCents } from "@foode/shared/money";

import {
  parseWith,
  text,
  type FieldErrors,
  type FormLike,
  type ParseResult,
  type SafeParser,
} from "./ops-forms";

/** Mensagens por campo do Cardápio (vencem a genérica do código do Zod). */
export const MENU_FIELD_MESSAGES: Record<string, string> = {
  name: "Informe o nome (até 120 caracteres).",
  description: "A descrição tem no máximo 600 caracteres.",
  priceCents: "Informe o preço em R$ (ex.: 12,90).",
  categoryId: "Escolha a categoria.",
  minSelect: "O mínimo precisa ser um número de 0 a 40.",
  maxSelect: "O máximo precisa ser um número de 1 a 40.",
  options: `Adicione de 1 a ${MAX_COMPLEMENT_OPTIONS} opções.`,
  sourceItemId: "Escolha o item de origem.",
  groupIds: "Escolha pelo menos um grupo para copiar.",
  "custom:minSelect não pode ser maior que maxSelect": "O mínimo não pode ser maior que o máximo.",
  "custom:minSelect não pode exceder o número de opções":
    "O mínimo não pode ser maior que o número de opções.",
  "custom:origem e destino iguais": "Escolha um item diferente deste.",
  "custom:nada para atualizar": "Nenhuma alteração para salvar.",
};

function parseMenu<T>(schema: SafeParser<T>, input: unknown) {
  return parseWith(schema, input, MENU_FIELD_MESSAGES);
}

/** Campo de R$ → centavos; texto inválido vira `NaN` para o Zod recusar no campo certo. */
function money(form: FormLike, name: string, fallback: number | null = null): number {
  const raw = text(form, name).trim();
  if (!raw && fallback !== null) return fallback;
  return reaisToCents(raw) ?? Number.NaN;
}

function integer(form: FormLike, name: string): number {
  const raw = text(form, name).trim();
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** Checkbox: presente = true. Para edição parcial, `absentAs` diz o que a ausência significa. */
function flag(form: FormLike, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true" || value === "1";
}

function ids(form: FormLike, name: string): string[] {
  return form.getAll(name).map(String).filter(Boolean);
}

// ---- Reordenação por botões (CAR-04) ----

/**
 * Move `id` uma posição para cima ou para baixo na lista; devolve a mesma lista se não há o
 * que mover. A action manda o conjunto completo para a api (que exige o conjunto exato).
 */
export function moveId(list: readonly string[], id: string, direction: "up" | "down"): string[] {
  const index = list.indexOf(id);
  if (index === -1) return [...list];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const current = next[index]!;
  next[index] = next[target]!;
  next[target] = current;
  return next;
}

function reorderInput(form: FormLike) {
  const direction = text(form, "direction") === "up" ? "up" : "down";
  return moveId(ids(form, "orderedIds"), text(form, "moveId"), direction);
}

// ---- Categorias ----

export function parseCreateCategory(form: FormLike) {
  return parseMenu(menuCreateCategoryInputSchema, { name: text(form, "name") });
}

export function parseRenameCategory(form: FormLike) {
  return parseMenu(menuUpdateCategoryInputSchema, {
    categoryId: text(form, "categoryId"),
    name: text(form, "name"),
  });
}

export function parseSetCategoryAvailable(form: FormLike) {
  return parseMenu(menuUpdateCategoryInputSchema, {
    categoryId: text(form, "categoryId"),
    available: text(form, "available") === "true",
  });
}

export function parseDeleteCategory(form: FormLike) {
  return parseMenu(menuDeleteCategoryInputSchema, { categoryId: text(form, "categoryId") });
}

export function parseReorderCategories(form: FormLike) {
  return parseMenu(menuReorderCategoriesInputSchema, { orderedCategoryIds: reorderInput(form) });
}

// ---- Itens ----

/** Dados do item (seção "Dados" do formulário, criação e edição). */
function readItemFields(form: FormLike) {
  return {
    name: text(form, "name"),
    description: text(form, "description"),
    priceCents: money(form, "priceCents"),
    available: flag(form, "available"),
    featured: flag(form, "featured"),
    imageObjectKey: text(form, "imageObjectKey").trim() || null,
  };
}

export function parseCreateItem(form: FormLike) {
  return parseMenu(menuCreateItemInputSchema, {
    categoryId: text(form, "categoryId"),
    ...readItemFields(form),
  });
}

export function parseUpdateItem(form: FormLike) {
  return parseMenu(menuUpdateItemInputSchema, {
    itemId: text(form, "itemId"),
    categoryId: text(form, "categoryId").trim() || undefined,
    ...readItemFields(form),
  });
}

/** Preço inline (P-CAR-5): só `priceCents`. */
export function parseSetItemPrice(form: FormLike) {
  return parseMenu(menuUpdateItemInputSchema, {
    itemId: text(form, "itemId"),
    priceCents: money(form, "priceCents"),
  });
}

/** Disponibilidade inline (CAR-02): só `available`. */
export function parseSetItemAvailable(form: FormLike) {
  return parseMenu(menuUpdateItemInputSchema, {
    itemId: text(form, "itemId"),
    available: text(form, "available") === "true",
  });
}

export function parseDeleteItem(form: FormLike) {
  return parseMenu(menuDeleteItemInputSchema, { itemId: text(form, "itemId") });
}

export function parseReorderItems(form: FormLike) {
  return parseMenu(menuReorderItemsInputSchema, {
    categoryId: text(form, "categoryId"),
    orderedItemIds: reorderInput(form),
  });
}

// ---- Grupos de Complemento ----

/**
 * Opções do grupo: linhas `options.<i>.name|priceCents|id`, `optionCount` diz quantas há.
 * Linha sem nome e sem preço é ignorada (o Dono clicou em "Nova opção" e não preencheu).
 */
function readOptions(form: FormLike, withIds: boolean) {
  const count = Math.max(
    0,
    Math.min(MAX_COMPLEMENT_OPTIONS + 1, integer(form, "optionCount") || 0),
  );
  const options: { id?: string; name: string; priceCents: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = text(form, `options.${i}.name`).trim();
    const priceRaw = text(form, `options.${i}.priceCents`).trim();
    const id = withIds ? text(form, `options.${i}.id`).trim() : "";
    if (!name && !priceRaw && !id) continue;
    options.push({
      ...(id ? { id } : {}),
      name,
      priceCents: money(form, `options.${i}.priceCents`, 0),
    });
  }
  return options;
}

function readSelection(form: FormLike) {
  return { minSelect: integer(form, "minSelect"), maxSelect: integer(form, "maxSelect") };
}

/** Erros de `options.<i>.campo` viram `options.<i>.campo` mesmo (a tela liga por índice). */
export function parseCreateComplementGroup(form: FormLike) {
  return parseMenu(menuCreateComplementGroupInputSchema, {
    itemId: text(form, "itemId"),
    name: text(form, "name"),
    ...readSelection(form),
    options: readOptions(form, false),
  });
}

export function parseUpdateComplementGroup(form: FormLike) {
  return parseMenu(menuUpdateComplementGroupInputSchema, {
    groupId: text(form, "groupId"),
    name: text(form, "name"),
    ...readSelection(form),
    options: readOptions(form, true),
  });
}

export function parseDeleteComplementGroup(form: FormLike) {
  return parseMenu(menuDeleteComplementGroupInputSchema, { groupId: text(form, "groupId") });
}

export function parseReorderComplementGroups(form: FormLike) {
  return parseMenu(menuReorderComplementGroupsInputSchema, {
    itemId: text(form, "itemId"),
    orderedGroupIds: reorderInput(form),
  });
}

/** P-CAR-1: `groupIds` vazio = copiar todos os grupos do item de origem. */
export function parseCopyComplementGroups(form: FormLike) {
  const groupIds = ids(form, "groupIds");
  return parseMenu(menuCopyComplementGroupsInputSchema, {
    sourceItemId: text(form, "sourceItemId"),
    targetItemId: text(form, "targetItemId"),
    ...(groupIds.length > 0 ? { groupIds } : {}),
  });
}

// ---- Adicionais ----

export function parseCreateAdditional(form: FormLike) {
  return parseMenu(menuCreateAdditionalInputSchema, {
    itemId: text(form, "itemId"),
    name: text(form, "name"),
    priceCents: money(form, "priceCents"),
    available: true,
  });
}

export function parseUpdateAdditional(form: FormLike) {
  return parseMenu(menuUpdateAdditionalInputSchema, {
    additionalId: text(form, "additionalId"),
    name: text(form, "name"),
    priceCents: money(form, "priceCents"),
  });
}

export function parseSetAdditionalAvailable(form: FormLike) {
  return parseMenu(menuUpdateAdditionalInputSchema, {
    additionalId: text(form, "additionalId"),
    available: text(form, "available") === "true",
  });
}

export function parseDeleteAdditional(form: FormLike) {
  return parseMenu(menuDeleteAdditionalInputSchema, { additionalId: text(form, "additionalId") });
}

export function parseReorderAdditionals(form: FormLike) {
  return parseMenu(menuReorderAdditionalsInputSchema, {
    itemId: text(form, "itemId"),
    orderedAdditionalIds: reorderInput(form),
  });
}

export { MAX_ADDITIONALS_PER_ITEM, MAX_COMPLEMENT_OPTIONS };

// ---- Foto (CAR-07: formatos e tamanho ditos antes do erro) ----

export const MENU_IMAGE_ACCEPT = MENU_IMAGE_CONTENT_TYPES.join(",");
export const MENU_IMAGE_HINT = "JPEG, PNG ou WebP, até 5 MB.";

export type ImageCheck =
  { ok: true; contentType: MenuImageContentType } | { ok: false; message: string };

/** Validação no cliente antes do envio: tipo declarado e tamanho. A api confere os bytes. */
export function checkMenuImageFile(file: { size: number; type: string }): ImageCheck {
  const contentType = MENU_IMAGE_CONTENT_TYPES.find((type) => type === file.type);
  if (!contentType) return { ok: false, message: "Formato não aceito. Envie JPEG, PNG ou WebP." };
  if (file.size === 0) return { ok: false, message: "O arquivo está vazio." };
  if (file.size > MENU_IMAGE_MAX_BYTES) {
    return { ok: false, message: "A foto passa de 5 MB. Reduza o tamanho e envie de novo." };
  }
  return { ok: true, contentType };
}

/** Resultado do upload para o cliente (não é FormState: a foto entra num campo do item). */
export type UploadResult =
  { ok: true; objectKey: string; imageUrl: string | null } | { ok: false; message: string };

export type { FieldErrors, ParseResult };
