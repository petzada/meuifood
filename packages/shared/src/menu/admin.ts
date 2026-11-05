// Contrato do Cardápio no Painel (Ticket 23): entradas das RPCs `menu*` do PainelApi e o shape
// que o admin lê. Só o Dono opera (`can(role, "store.menu")`); a Loja vem SEMPRE do contexto da
// sessão (StoreContext), nunca de um `storeId` na entrada. Ids de outra Loja são indistinguíveis
// de inexistentes (`not_found`).
//
// Decisão 63 aplicada aqui: preço opcional na opção de Complemento (P-1.1), Destaque com teto de
// 4 por Loja conferido no servidor (P-5.5, excedente = `conflict`), copiar grupos de outro item
// sem grupos compartilhados (P-CAR-1), preço inline = `menuUpdateItem({ itemId, priceCents })`
// (P-CAR-5). Sem observação por item (P-1.5).
import { z } from "zod";

import { centsSchema } from "../money.js";
import {
  MAX_ADDITIONALS_PER_ITEM,
  MAX_COMPLEMENT_OPTIONS,
  menuDescriptionSchema,
  menuIdSchema,
  menuNameSchema,
} from "./schema.js";

/** Teto de ids numa lista de reordenação (categorias ou itens de uma categoria). */
export const MAX_REORDER_IDS = 500;

/** Lista de ids sem repetição: o servidor exige o conjunto exato dos irmãos (senão `conflict`). */
function orderedIdsSchema(max: number) {
  return z
    .array(menuIdSchema)
    .min(1)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: "id repetido na ordem" });
}

/** Partial de update: pelo menos um campo além do id. */
function requireSomeField(idKey: string) {
  return (value: Record<string, unknown>) =>
    Object.entries(value).some(([key, v]) => key !== idKey && v !== undefined);
}

const emptyUpdate = { message: "nada para atualizar" } as const;

// ---- Categorias -------------------------------------------------------------------------

export const menuCreateCategoryInputSchema = z.object({
  name: menuNameSchema,
  available: z.boolean().default(true),
});

export const menuUpdateCategoryInputSchema = z
  .object({
    categoryId: menuIdSchema,
    name: menuNameSchema.optional(),
    /** Disponibilidade inline (CAR-02): false tira a categoria inteira do Storefront. */
    available: z.boolean().optional(),
  })
  .refine(requireSomeField("categoryId"), emptyUpdate);

/** Categoria com itens não é apagada: `conflict` (comportamento do Ticket 05). */
export const menuDeleteCategoryInputSchema = z.object({ categoryId: menuIdSchema });

export const menuReorderCategoriesInputSchema = z.object({
  orderedCategoryIds: orderedIdsSchema(MAX_REORDER_IDS),
});

// ---- Itens ------------------------------------------------------------------------------

/**
 * Chave de imagem no R2 devolvida por `menuRequestImageUpload`. O servidor confere que é da
 * Loja do contexto (`isStoreMenuImageKey`) e que o objeto existe no bucket antes de gravar.
 */
export const menuImageObjectKeySchema = z.string().trim().min(1).max(200);

export const menuCreateItemInputSchema = z.object({
  categoryId: menuIdSchema,
  name: menuNameSchema,
  description: menuDescriptionSchema.default(""),
  priceCents: centsSchema,
  available: z.boolean().default(true),
  /** P-5.5: o 5º destaque da Loja = `conflict`. */
  featured: z.boolean().default(false),
  imageObjectKey: menuImageObjectKeySchema.nullable().default(null),
});

/**
 * Edita só os campos enviados. Preço inline (P-CAR-5) e disponibilidade inline (CAR-02) usam
 * esta mesma RPC com um campo. `categoryId` move o item para o fim da outra categoria.
 * `imageObjectKey: null` remove a foto; trocar/remover apaga o objeto antigo do R2 (só da Loja).
 */
export const menuUpdateItemInputSchema = z
  .object({
    itemId: menuIdSchema,
    categoryId: menuIdSchema.optional(),
    name: menuNameSchema.optional(),
    description: menuDescriptionSchema.optional(),
    priceCents: centsSchema.optional(),
    available: z.boolean().optional(),
    featured: z.boolean().optional(),
    imageObjectKey: menuImageObjectKeySchema.nullable().optional(),
  })
  .refine(requireSomeField("itemId"), emptyUpdate);

/** Apaga o item com grupos, opções e Adicionais (cascade) e a imagem no R2. */
export const menuDeleteItemInputSchema = z.object({ itemId: menuIdSchema });

export const menuReorderItemsInputSchema = z.object({
  categoryId: menuIdSchema,
  orderedItemIds: orderedIdsSchema(MAX_REORDER_IDS),
});

// ---- Grupos de Complemento --------------------------------------------------------------

/** Opção na escrita: `priceCents` opcional, padrão 0 (P-1.1). `id` presente = opção existente. */
export const menuComplementOptionInputSchema = z.object({
  id: menuIdSchema.optional(),
  name: menuNameSchema,
  priceCents: centsSchema.default(0),
});

type SelectionBounds = {
  minSelect?: number | undefined;
  maxSelect?: number | undefined;
  options?: unknown[] | undefined;
};

/** CAR-06: máx ≥ mín; mín ≤ número de opções (quando os dois lados vêm na entrada). */
function refineSelectionBounds(group: SelectionBounds, ctx: z.RefinementCtx) {
  if (
    group.minSelect !== undefined &&
    group.maxSelect !== undefined &&
    group.minSelect > group.maxSelect
  ) {
    ctx.addIssue({
      code: "custom",
      message: "minSelect não pode ser maior que maxSelect",
      path: ["minSelect"],
    });
  }
  if (
    group.minSelect !== undefined &&
    group.options !== undefined &&
    group.minSelect > group.options.length
  ) {
    ctx.addIssue({
      code: "custom",
      message: "minSelect não pode exceder o número de opções",
      path: ["minSelect"],
    });
  }
}

const selectSchema = {
  minSelect: z.number().int().min(0).max(MAX_COMPLEMENT_OPTIONS),
  maxSelect: z.number().int().min(1).max(MAX_COMPLEMENT_OPTIONS),
};

export const menuCreateComplementGroupInputSchema = z
  .object({
    itemId: menuIdSchema,
    name: menuNameSchema,
    ...selectSchema,
    options: z
      .array(menuComplementOptionInputSchema.omit({ id: true }))
      .min(1)
      .max(MAX_COMPLEMENT_OPTIONS),
  })
  .superRefine(refineSelectionBounds);

/**
 * Edita o grupo. `options`, quando enviado, é a lista COMPLETA na nova ordem: opção com `id`
 * existente é atualizada, sem `id` é criada, e a que ficou de fora é apagada. Limites que só
 * fecham com o que está gravado (ex.: novo `minSelect` > opções atuais) = `invalid_input`.
 */
export const menuUpdateComplementGroupInputSchema = z
  .object({
    groupId: menuIdSchema,
    name: menuNameSchema.optional(),
    minSelect: selectSchema.minSelect.optional(),
    maxSelect: selectSchema.maxSelect.optional(),
    options: z
      .array(menuComplementOptionInputSchema)
      .min(1)
      .max(MAX_COMPLEMENT_OPTIONS)
      .refine(
        (options) => {
          const ids = options.flatMap((option) => (option.id ? [option.id] : []));
          return new Set(ids).size === ids.length;
        },
        { message: "opção repetida" },
      )
      .optional(),
  })
  .refine(requireSomeField("groupId"), emptyUpdate)
  .superRefine(refineSelectionBounds);

export const menuDeleteComplementGroupInputSchema = z.object({ groupId: menuIdSchema });

export const menuReorderComplementGroupsInputSchema = z.object({
  itemId: menuIdSchema,
  orderedGroupIds: orderedIdsSchema(MAX_REORDER_IDS),
});

/**
 * P-CAR-1: copia grupos (com opções e preços) de outro item da MESMA Loja para o fim do item
 * alvo, com ids novos; editar a cópia não muda o original. Sem `groupIds` copia todos.
 */
export const menuCopyComplementGroupsInputSchema = z
  .object({
    sourceItemId: menuIdSchema,
    targetItemId: menuIdSchema,
    groupIds: z
      .array(menuIdSchema)
      .min(1)
      .max(MAX_REORDER_IDS)
      .refine((ids) => new Set(ids).size === ids.length, { message: "grupo repetido" })
      .optional(),
  })
  .refine((input) => input.sourceItemId !== input.targetItemId, {
    message: "origem e destino iguais",
    path: ["targetItemId"],
  });

// ---- Adicionais -------------------------------------------------------------------------

export const menuCreateAdditionalInputSchema = z.object({
  itemId: menuIdSchema,
  name: menuNameSchema,
  priceCents: centsSchema,
  available: z.boolean().default(true),
});

export const menuUpdateAdditionalInputSchema = z
  .object({
    additionalId: menuIdSchema,
    name: menuNameSchema.optional(),
    priceCents: centsSchema.optional(),
    available: z.boolean().optional(),
  })
  .refine(requireSomeField("additionalId"), emptyUpdate);

export const menuDeleteAdditionalInputSchema = z.object({ additionalId: menuIdSchema });

export const menuReorderAdditionalsInputSchema = z.object({
  itemId: menuIdSchema,
  orderedAdditionalIds: orderedIdsSchema(MAX_ADDITIONALS_PER_ITEM),
});

// ---- Imagem (R2, decisão 57) ------------------------------------------------------------

/** JPEG, PNG ou WebP até 5 MiB (decisão 57). */
export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MENU_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MenuImageContentType = (typeof MENU_IMAGE_CONTENT_TYPES)[number];

export const MENU_IMAGE_EXTENSIONS: Readonly<Record<MenuImageContentType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Validade da URL pré-assinada de upload. */
export const MENU_IMAGE_UPLOAD_TTL_SECONDS = 300;

/**
 * Pedido de upload: o admin declara tipo e tamanho; a `api` (só Dono) gera a chave
 * `stores/{store_id}/menu/{uuid}.{ext}` e assina um PUT com esse Content-Type e Content-Length.
 * O cliente nunca escolhe prefixo nem caminho.
 */
export const menuRequestImageUploadInputSchema = z.object({
  contentType: z.enum(MENU_IMAGE_CONTENT_TYPES),
  contentLength: z.number().int().min(1).max(MENU_IMAGE_MAX_BYTES),
});

/**
 * Resposta do pedido de upload. O navegador faz `PUT uploadUrl` com `headers` exatamente como
 * vieram e o arquivo no corpo; depois grava `objectKey` no item (`menuCreateItem`/`menuUpdateItem`).
 */
export type MenuImageUploadTicket = {
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

/** Chave do objeto no R2 para a Loja (o servidor gera o `objectId` com crypto.randomUUID). */
export function menuImageObjectKey(
  storeId: string,
  contentType: MenuImageContentType,
  objectId: string,
): string {
  return `stores/${storeId}/menu/${objectId}.${MENU_IMAGE_EXTENSIONS[contentType]}`;
}

const MENU_IMAGE_KEY_TAIL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

/** A chave é de imagem do Cardápio DESTA Loja? (nunca apagar/aceitar objeto de outra Loja). */
export function isStoreMenuImageKey(storeId: string, objectKey: string): boolean {
  const prefix = `stores/${storeId}/menu/`;
  return objectKey.startsWith(prefix) && MENU_IMAGE_KEY_TAIL.test(objectKey.slice(prefix.length));
}

/** URL pública de leitura (bucket público por base URL, sem assinatura). */
export function publicMenuImageUrl(publicBaseUrl: string, objectKey: string): string {
  return `${publicBaseUrl.replace(/\/+$/u, "")}/${objectKey}`;
}

// ---- Leitura no Painel ------------------------------------------------------------------

/** Opção como o Painel lê (com preço, P-1.1). */
export type AdminComplementOption = { id: string; name: string; priceCents: number };

export type AdminComplementGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: AdminComplementOption[];
};

export type AdminAdditional = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
};

/** Item no Painel: inclui indisponíveis, a chave da imagem e a URL pública para a prévia. */
export type AdminMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  featured: boolean;
  imageObjectKey: string | null;
  imageUrl: string | null;
  complementGroups: AdminComplementGroup[];
  additionals: AdminAdditional[];
};

export type AdminMenuCategory = {
  id: string;
  name: string;
  available: boolean;
  items: AdminMenuItem[];
};

/**
 * Cardápio completo da Loja ativa, na ordem do Dono (`position`). `featuredCount` alimenta o
 * aviso "Destaques: 3 de 4" sem recontar no cliente.
 */
export type AdminMenu = {
  categories: AdminMenuCategory[];
  featuredCount: number;
  maxFeatured: number;
};

export type MenuCreateCategoryInput = z.input<typeof menuCreateCategoryInputSchema>;
export type MenuUpdateCategoryInput = z.input<typeof menuUpdateCategoryInputSchema>;
export type MenuDeleteCategoryInput = z.input<typeof menuDeleteCategoryInputSchema>;
export type MenuReorderCategoriesInput = z.input<typeof menuReorderCategoriesInputSchema>;
export type MenuCreateItemInput = z.input<typeof menuCreateItemInputSchema>;
export type MenuUpdateItemInput = z.input<typeof menuUpdateItemInputSchema>;
export type MenuDeleteItemInput = z.input<typeof menuDeleteItemInputSchema>;
export type MenuReorderItemsInput = z.input<typeof menuReorderItemsInputSchema>;
export type MenuCreateComplementGroupInput = z.input<typeof menuCreateComplementGroupInputSchema>;
export type MenuUpdateComplementGroupInput = z.input<typeof menuUpdateComplementGroupInputSchema>;
export type MenuDeleteComplementGroupInput = z.input<typeof menuDeleteComplementGroupInputSchema>;
export type MenuReorderComplementGroupsInput = z.input<
  typeof menuReorderComplementGroupsInputSchema
>;
export type MenuCopyComplementGroupsInput = z.input<typeof menuCopyComplementGroupsInputSchema>;
export type MenuCreateAdditionalInput = z.input<typeof menuCreateAdditionalInputSchema>;
export type MenuUpdateAdditionalInput = z.input<typeof menuUpdateAdditionalInputSchema>;
export type MenuDeleteAdditionalInput = z.input<typeof menuDeleteAdditionalInputSchema>;
export type MenuReorderAdditionalsInput = z.input<typeof menuReorderAdditionalsInputSchema>;
export type MenuRequestImageUploadInput = z.input<typeof menuRequestImageUploadInputSchema>;
