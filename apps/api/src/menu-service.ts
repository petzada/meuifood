// RPCs do Cardápio no Painel (Ticket 23). Cada método valida a entrada com o schema de
// @foode/shared/menu, autoriza só quem tem `store.menu` na Loja ATIVA (Dono, StoreContext emitido
// por @foode/db) e opera por `db.store(context).menu()` (com auditoria). Imagem: bytes pela RPC,
// gravados no R2 pelo binding `MEDIA` (decisão 64).
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import type { FoodeDb, MenuResult, StoreContext, StoreMenu } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  type AdminMenu,
  MAX_FEATURED_ITEMS,
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
  type MenuUploadedImage,
  menuUploadImageInputSchema,
} from "@foode/shared/menu";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { deleteMenuImage, menuImageExists, menuImageUrl, putMenuImage } from "./media";
import { callerHeaders } from "./painel-service";

export type MenuServiceDeps = {
  db: FoodeDb;
  auth: FoodeAuth;
  /** Binding R2 `MEDIA` (bucket `foode-media`). */
  media: R2Bucket;
  /** Base pública de leitura (`.../media`); null = sem URL de prévia. */
  mediaBaseUrl: string | null;
};

/** Uploads de imagem por usuário: 60 por hora. */
export const MENU_UPLOAD_RATE_LIMIT = { windowSeconds: 3600, max: 60 } as const;

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

/** RPC sem entrada. */
const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

/** O resultado do @foode/db já usa os códigos do RpcResult. */
const asRpc = <T>(result: MenuResult<T>): RpcResult<T> => result;

function toAdminMenu(menu: StoreMenu, baseUrl: string | null): AdminMenu {
  let featuredCount = 0;
  const categories = menu.categories.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      if (item.featured) featuredCount += 1;
      return { ...item, imageUrl: menuImageUrl(baseUrl, item.imageObjectKey) };
    }),
  }));
  return { categories, featuredCount, maxFeatured: MAX_FEATURED_ITEMS };
}

export function createMenuService(deps: MenuServiceDeps) {
  const { db, auth, media, mediaBaseUrl } = deps;

  /**
   * Valida, resolve a sessão e exige StoreContext com `store.menu`; só então chama `operation`.
   * Operador e Ops recebem `forbidden` sem nenhum efeito.
   */
  async function asMenuOwner<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, input: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("store.menu"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "store") return { ok: false, error: "forbidden" };
    return operation(result.authorized.store, parsed.data);
  }

  const menuOf = (context: StoreContext) => db.store(context).menu();

  /** Chave de imagem enviada pelo Painel: tem de ser desta Loja e existir no bucket. */
  async function imageKeyAccepted(context: StoreContext, objectKey: string | null | undefined) {
    if (objectKey === null || objectKey === undefined) return true;
    return menuImageExists(media, context.storeId, objectKey);
  }

  /** Apaga a imagem antiga se nenhum outro item desta Loja ainda a usa. */
  async function discardImage(context: StoreContext, objectKey: string | null): Promise<void> {
    if (!objectKey) return;
    if (await menuOf(context).imageKeyInUse(objectKey)) return;
    await deleteMenuImage(media, context.storeId, objectKey);
  }

  return {
    menuGet: (caller: PainelCaller) =>
      asMenuOwner(caller, noInput, undefined, async (context): Promise<RpcResult<AdminMenu>> => {
        const menu = await menuOf(context).get();
        return { ok: true, data: toAdminMenu(menu, mediaBaseUrl) };
      }),

    menuCreateCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateCategoryInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).createCategory(data)),
      ),

    menuUpdateCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateCategoryInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).updateCategory(data)),
      ),

    menuDeleteCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteCategoryInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).deleteCategory(data.categoryId)),
      ),

    menuReorderCategories: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderCategoriesInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).reorderCategories(data.orderedCategoryIds)),
      ),

    menuCreateItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateItemInputSchema, input, async (context, data) => {
        if (!(await imageKeyAccepted(context, data.imageObjectKey))) {
          return { ok: false, error: "invalid_input" };
        }
        return asRpc(await menuOf(context).createItem(data));
      }),

    menuUpdateItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuUpdateItemInputSchema,
        input,
        async (context, data): Promise<RpcResult<null>> => {
          if (!(await imageKeyAccepted(context, data.imageObjectKey))) {
            return { ok: false, error: "invalid_input" };
          }
          const result = await menuOf(context).updateItem(data);
          if (!result.ok) return result;
          await discardImage(context, result.data.previousImageObjectKey);
          return { ok: true, data: null };
        },
      ),

    menuDeleteItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuDeleteItemInputSchema,
        input,
        async (context, data): Promise<RpcResult<null>> => {
          const result = await menuOf(context).deleteItem(data.itemId);
          if (!result.ok) return result;
          await discardImage(context, result.data.imageObjectKey);
          return { ok: true, data: null };
        },
      ),

    menuReorderItems: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderItemsInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).reorderItems(data.categoryId, data.orderedItemIds)),
      ),

    menuCreateComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateComplementGroupInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).createComplementGroup(data)),
      ),

    menuUpdateComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateComplementGroupInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).updateComplementGroup(data)),
      ),

    menuDeleteComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteComplementGroupInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).deleteComplementGroup(data.groupId)),
      ),

    menuReorderComplementGroups: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderComplementGroupsInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).reorderComplementGroups(data.itemId, data.orderedGroupIds)),
      ),

    menuCopyComplementGroups: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCopyComplementGroupsInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).copyComplementGroups(data)),
      ),

    menuCreateAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateAdditionalInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).createAdditional(data)),
      ),

    menuUpdateAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateAdditionalInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).updateAdditional(data)),
      ),

    menuDeleteAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteAdditionalInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).deleteAdditional(data.additionalId)),
      ),

    menuReorderAdditionals: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderAdditionalsInputSchema, input, async (context, data) =>
        asRpc(await menuOf(context).reorderAdditionals(data.itemId, data.orderedAdditionalIds)),
      ),

    /**
     * Bytes já conferidos pelo schema (tipo pela assinatura, ≤ 5 MiB). Rate limit por usuário;
     * grava numa chave nova da Loja e audita (sem nome de arquivo nem dado pessoal).
     */
    menuUploadImage: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuUploadImageInputSchema,
        input,
        async (context, data): Promise<RpcResult<MenuUploadedImage>> => {
          const allowed = await db.rateLimit.consume(
            `menu_image_upload:${context.userId}`,
            MENU_UPLOAD_RATE_LIMIT,
          );
          if (!allowed) return { ok: false, error: "rate_limited" };
          const objectKey = await putMenuImage(
            media,
            context.storeId,
            data.contentType,
            data.bytes,
          );
          await menuOf(context).recordAudit("menu.image_uploaded", objectKey, {
            contentType: data.contentType,
            bytes: data.bytes.byteLength,
          });
          return {
            ok: true,
            data: { objectKey, imageUrl: menuImageUrl(mediaBaseUrl, objectKey) },
          };
        },
      ),
  };
}

export type MenuService = ReturnType<typeof createMenuService>;
