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
import * as Sentry from "@sentry/cloudflare";
import { WorkerEntrypoint } from "cloudflare:workers";

import { apiHealth } from "./app";
import { AUTH_BASE_PATH, createAuth, panelUrlOf } from "./auth/auth";
import { createTurnstileVerifier } from "./auth/turnstile";
import { createMillionSendSender } from "./email/sender";
import type { Env } from "./env";
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
}
