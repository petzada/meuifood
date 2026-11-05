// RPCs do Cardápio no Painel (Ticket 23). CONTRATO: cada método já valida a entrada com o schema
// de @foode/shared/menu e autoriza só quem tem `store.menu` na Loja ATIVA (Dono, StoreContext
// emitido por @foode/db); a regra de negócio ainda devolve `not_implemented` — a fatia API do
// Ticket 23 troca o `notImplemented` de cada método por operação em `db.store(context)` (com
// auditoria) e, na imagem, pela assinatura do PUT no R2.
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import type { FoodeDb, StoreContext } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  type AdminMenu,
  menuCopyComplementGroupsInputSchema,
  menuCreateAdditionalInputSchema,
  menuCreateCategoryInputSchema,
  menuCreateComplementGroupInputSchema,
  menuCreateItemInputSchema,
  menuDeleteAdditionalInputSchema,
  menuDeleteCategoryInputSchema,
  menuDeleteComplementGroupInputSchema,
  menuDeleteItemInputSchema,
  type MenuImageUploadTicket,
  menuReorderAdditionalsInputSchema,
  menuReorderCategoriesInputSchema,
  menuReorderComplementGroupsInputSchema,
  menuReorderItemsInputSchema,
  menuRequestImageUploadInputSchema,
  menuUpdateAdditionalInputSchema,
  menuUpdateCategoryInputSchema,
  menuUpdateComplementGroupInputSchema,
  menuUpdateItemInputSchema,
} from "@foode/shared/menu";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { callerHeaders } from "./painel-service";

export type MenuServiceDeps = { db: FoodeDb; auth: FoodeAuth };

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

/** RPC sem entrada. */
const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

export function createMenuService(deps: MenuServiceDeps) {
  const { db, auth } = deps;

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

  /** Corpo provisório do contrato: autorizado, mas sem regra de negócio ainda. */
  async function notImplemented<T>(): Promise<RpcResult<T>> {
    return { ok: false, error: "not_implemented" };
  }

  type Id<K extends string> = { [P in K]: string };

  return {
    menuGet: (caller: PainelCaller) =>
      asMenuOwner(caller, noInput, undefined, notImplemented<AdminMenu>),
    menuCreateCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateCategoryInputSchema, input, notImplemented<Id<"categoryId">>),
    menuUpdateCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateCategoryInputSchema, input, notImplemented<null>),
    menuDeleteCategory: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteCategoryInputSchema, input, notImplemented<null>),
    menuReorderCategories: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderCategoriesInputSchema, input, notImplemented<null>),
    menuCreateItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuCreateItemInputSchema, input, notImplemented<Id<"itemId">>),
    menuUpdateItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateItemInputSchema, input, notImplemented<null>),
    menuDeleteItem: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteItemInputSchema, input, notImplemented<null>),
    menuReorderItems: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderItemsInputSchema, input, notImplemented<null>),
    menuCreateComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuCreateComplementGroupInputSchema,
        input,
        notImplemented<Id<"groupId">>,
      ),
    menuUpdateComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateComplementGroupInputSchema, input, notImplemented<null>),
    menuDeleteComplementGroup: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteComplementGroupInputSchema, input, notImplemented<null>),
    menuReorderComplementGroups: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderComplementGroupsInputSchema, input, notImplemented<null>),
    menuCopyComplementGroups: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuCopyComplementGroupsInputSchema,
        input,
        notImplemented<{ groupIds: string[] }>,
      ),
    menuCreateAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuCreateAdditionalInputSchema,
        input,
        notImplemented<Id<"additionalId">>,
      ),
    menuUpdateAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuUpdateAdditionalInputSchema, input, notImplemented<null>),
    menuDeleteAdditional: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuDeleteAdditionalInputSchema, input, notImplemented<null>),
    menuReorderAdditionals: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(caller, menuReorderAdditionalsInputSchema, input, notImplemented<null>),
    menuRequestImageUpload: (caller: PainelCaller, input: unknown) =>
      asMenuOwner(
        caller,
        menuRequestImageUploadInputSchema,
        input,
        notImplemented<MenuImageUploadTicket>,
      ),
  };
}

export type MenuService = ReturnType<typeof createMenuService>;
