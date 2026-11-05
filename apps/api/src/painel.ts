// Entrypoint RPC do Painel. Exportado como classe nomeada do Worker: só um service
// binding com `"entrypoint": "PainelApi"` (o do admin) chega aqui; o fetch público não.
// Toda operação recebe o `PainelCaller` (cookie da sessão Better Auth + IP), passa pelo guard
// (auth/guard.ts), que confere a membership em @foode/db, e só então opera com o
// StoreContext/OpsContext emitido pelo pacote. As regras ficam em painel-service.ts.
import { createFoodeDb } from "@foode/db";
import type { ApiHealth, PainelCaller, PainelRpc, StoreMemberView } from "@foode/shared";
import type {
  ActiveStore,
  InviteMemberInput,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  RpcResult,
  SessionCtx,
  SwitchActiveStoreInput,
} from "@foode/shared/auth";
import type {
  AdminMenu,
  MenuCopyComplementGroupsInput,
  MenuCreateAdditionalInput,
  MenuCreateCategoryInput,
  MenuCreateComplementGroupInput,
  MenuCreateItemInput,
  MenuDeleteAdditionalInput,
  MenuDeleteCategoryInput,
  MenuDeleteComplementGroupInput,
  MenuDeleteItemInput,
  MenuImageUploadTicket,
  MenuReorderAdditionalsInput,
  MenuReorderCategoriesInput,
  MenuReorderComplementGroupsInput,
  MenuReorderItemsInput,
  MenuRequestImageUploadInput,
  MenuUpdateAdditionalInput,
  MenuUpdateCategoryInput,
  MenuUpdateComplementGroupInput,
  MenuUpdateItemInput,
} from "@foode/shared/menu";
import * as Sentry from "@sentry/cloudflare";
import { WorkerEntrypoint } from "cloudflare:workers";

import { apiHealth } from "./app";
import { AUTH_BASE_PATH, createAuth, panelUrlOf } from "./auth/auth";
import { createTurnstileVerifier } from "./auth/turnstile";
import { createMillionSendSender } from "./email/sender";
import type { Env } from "./env";
import { createMenuService, type MenuService } from "./menu-service";
import { createPainelService, type PainelService } from "./painel-service";

export class PainelApi extends WorkerEntrypoint<Env> implements PainelRpc {
  private deps() {
    const email = createMillionSendSender(this.env);
    const waitUntil = (promise: Promise<unknown>) => this.ctx.waitUntil(promise);
    return { email, waitUntil, auth: createAuth(this.env, { email, waitUntil }) };
  }

  private service(): PainelService {
    const { email, waitUntil, auth } = this.deps();
    return createPainelService({
      db: createFoodeDb(this.env.DB),
      auth,
      email,
      waitUntil,
      turnstile: createTurnstileVerifier(this.env),
      panelUrl: panelUrlOf(this.env),
    });
  }

  /** Cardápio (Ticket 23): só Dono da Loja ativa; regras em menu-service.ts. */
  private menu(): MenuService {
    const { auth } = this.deps();
    return createMenuService({ db: createFoodeDb(this.env.DB), auth });
  }

  /** Falha inesperada: registra sem dados da request e propaga (o admin mostra erro genérico). */
  private async run<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      Sentry.captureException(error);
      const message = error instanceof Error ? error.message : "erro desconhecido";
      console.error(JSON.stringify({ level: "error", message, rpc: name }));
      throw new Error("internal_error");
    }
  }

  async health(): Promise<ApiHealth> {
    return apiHealth(createFoodeDb(this.env.DB));
  }

  /**
   * `/api/auth/*` → Better Auth. Só chega pelo binding do admin, que sobrescreve
   * `cf-connecting-ip` (rate limit por IP); sem ele a request é recusada.
   */
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== AUTH_BASE_PATH && !pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!request.headers.get("cf-connecting-ip")) {
      return Response.json({ error: "missing_client_ip" }, { status: 400 });
    }
    return this.run("fetch", () => this.deps().auth.handler(request));
  }

  async session(caller: PainelCaller): Promise<SessionCtx | null> {
    return this.run("session", () => this.service().session(caller));
  }

  async switchActiveStore(
    caller: PainelCaller,
    input: SwitchActiveStoreInput,
  ): Promise<RpcResult<ActiveStore>> {
    return this.run("switchActiveStore", () => this.service().switchActiveStore(caller, input));
  }

  async listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>> {
    return this.run("listMembers", () => this.service().listMembers(caller));
  }

  async inviteMember(
    caller: PainelCaller,
    input: InviteMemberInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    return this.run("inviteMember", () => this.service().inviteMember(caller, input));
  }

  async opsInviteOwner(
    caller: PainelCaller,
    input: OpsInviteOwnerInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    return this.run("opsInviteOwner", () => this.service().opsInviteOwner(caller, input));
  }

  async removeMember(caller: PainelCaller, input: RemoveMemberInput): Promise<RpcResult<null>> {
    return this.run("removeMember", () => this.service().removeMember(caller, input));
  }

  async menuGet(caller: PainelCaller): Promise<RpcResult<AdminMenu>> {
    return this.run("menuGet", () => this.menu().menuGet(caller));
  }

  async menuCreateCategory(
    caller: PainelCaller,
    input: MenuCreateCategoryInput,
  ): Promise<RpcResult<{ categoryId: string }>> {
    return this.run("menuCreateCategory", () => this.menu().menuCreateCategory(caller, input));
  }

  async menuUpdateCategory(
    caller: PainelCaller,
    input: MenuUpdateCategoryInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateCategory", () => this.menu().menuUpdateCategory(caller, input));
  }

  async menuDeleteCategory(
    caller: PainelCaller,
    input: MenuDeleteCategoryInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteCategory", () => this.menu().menuDeleteCategory(caller, input));
  }

  async menuReorderCategories(
    caller: PainelCaller,
    input: MenuReorderCategoriesInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderCategories", () =>
      this.menu().menuReorderCategories(caller, input),
    );
  }

  async menuCreateItem(
    caller: PainelCaller,
    input: MenuCreateItemInput,
  ): Promise<RpcResult<{ itemId: string }>> {
    return this.run("menuCreateItem", () => this.menu().menuCreateItem(caller, input));
  }

  async menuUpdateItem(caller: PainelCaller, input: MenuUpdateItemInput): Promise<RpcResult<null>> {
    return this.run("menuUpdateItem", () => this.menu().menuUpdateItem(caller, input));
  }

  async menuDeleteItem(caller: PainelCaller, input: MenuDeleteItemInput): Promise<RpcResult<null>> {
    return this.run("menuDeleteItem", () => this.menu().menuDeleteItem(caller, input));
  }

  async menuReorderItems(
    caller: PainelCaller,
    input: MenuReorderItemsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderItems", () => this.menu().menuReorderItems(caller, input));
  }

  async menuCreateComplementGroup(
    caller: PainelCaller,
    input: MenuCreateComplementGroupInput,
  ): Promise<RpcResult<{ groupId: string }>> {
    return this.run("menuCreateComplementGroup", () =>
      this.menu().menuCreateComplementGroup(caller, input),
    );
  }

  async menuUpdateComplementGroup(
    caller: PainelCaller,
    input: MenuUpdateComplementGroupInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateComplementGroup", () =>
      this.menu().menuUpdateComplementGroup(caller, input),
    );
  }

  async menuDeleteComplementGroup(
    caller: PainelCaller,
    input: MenuDeleteComplementGroupInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteComplementGroup", () =>
      this.menu().menuDeleteComplementGroup(caller, input),
    );
  }

  async menuReorderComplementGroups(
    caller: PainelCaller,
    input: MenuReorderComplementGroupsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderComplementGroups", () =>
      this.menu().menuReorderComplementGroups(caller, input),
    );
  }

  async menuCopyComplementGroups(
    caller: PainelCaller,
    input: MenuCopyComplementGroupsInput,
  ): Promise<RpcResult<{ groupIds: string[] }>> {
    return this.run("menuCopyComplementGroups", () =>
      this.menu().menuCopyComplementGroups(caller, input),
    );
  }

  async menuCreateAdditional(
    caller: PainelCaller,
    input: MenuCreateAdditionalInput,
  ): Promise<RpcResult<{ additionalId: string }>> {
    return this.run("menuCreateAdditional", () => this.menu().menuCreateAdditional(caller, input));
  }

  async menuUpdateAdditional(
    caller: PainelCaller,
    input: MenuUpdateAdditionalInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuUpdateAdditional", () => this.menu().menuUpdateAdditional(caller, input));
  }

  async menuDeleteAdditional(
    caller: PainelCaller,
    input: MenuDeleteAdditionalInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuDeleteAdditional", () => this.menu().menuDeleteAdditional(caller, input));
  }

  async menuReorderAdditionals(
    caller: PainelCaller,
    input: MenuReorderAdditionalsInput,
  ): Promise<RpcResult<null>> {
    return this.run("menuReorderAdditionals", () =>
      this.menu().menuReorderAdditionals(caller, input),
    );
  }

  async menuRequestImageUpload(
    caller: PainelCaller,
    input: MenuRequestImageUploadInput,
  ): Promise<RpcResult<MenuImageUploadTicket>> {
    return this.run("menuRequestImageUpload", () =>
      this.menu().menuRequestImageUpload(caller, input),
    );
  }
}
