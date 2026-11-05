// Entrypoint RPC do Painel. Exportado como classe nomeada do Worker: só um service
// binding com `"entrypoint": "PainelApi"` (o do admin) chega aqui; o fetch público não.
// Toda operação de Loja recebe o `PainelCaller` (cookie da sessão Better Auth), passa pelo
// guard (auth/guard.ts), que confere a membership em @foode/db, e só então opera com o
// StoreContext/OpsContext emitido pelo pacote.
// Ticket 22: os métodos de Auth/membership abaixo são o contrato; até a fatia API, as RPCs
// devolvem `not_implemented` e o fetch (`/api/auth/*`) responde 501.
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
import { WorkerEntrypoint } from "cloudflare:workers";

import { apiHealth } from "./app";
import type { Env } from "./env";

const notImplemented = { ok: false, error: "not_implemented" } as const;

export class PainelApi extends WorkerEntrypoint<Env> implements PainelRpc {
  async health(): Promise<ApiHealth> {
    return apiHealth(createFoodeDb(this.env.DB));
  }

  /** `/api/auth/*` → `createAuth(env).handler`; qualquer outro caminho 404. */
  async fetch(request: Request): Promise<Response> {
    void request;
    return Response.json({ error: "not_implemented" }, { status: 501 });
  }

  async session(caller: PainelCaller): Promise<SessionCtx | null> {
    void caller;
    return null;
  }

  async switchActiveStore(
    caller: PainelCaller,
    input: SwitchActiveStoreInput,
  ): Promise<RpcResult<ActiveStore>> {
    void caller;
    void input;
    return notImplemented;
  }

  async listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>> {
    void caller;
    return notImplemented;
  }

  async inviteMember(
    caller: PainelCaller,
    input: InviteMemberInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    void caller;
    void input;
    return notImplemented;
  }

  async opsInviteOwner(
    caller: PainelCaller,
    input: OpsInviteOwnerInput,
  ): Promise<RpcResult<{ membershipId: string }>> {
    void caller;
    void input;
    return notImplemented;
  }

  async removeMember(caller: PainelCaller, input: RemoveMemberInput): Promise<RpcResult<null>> {
    void caller;
    void input;
    return notImplemented;
  }
}
