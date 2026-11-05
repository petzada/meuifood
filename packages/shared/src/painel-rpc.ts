// Contrato do service binding admin → api (entrypoint `PainelApi`, RPC). O navegador do
// Painel nunca fala com a api: o servidor do admin chama estes métodos pelo binding `API`.
import type {
  InviteMemberInput,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  SwitchActiveStoreInput,
} from "./auth/schemas.js";
import type { ActiveStore, RpcResult, SessionCtx } from "./auth/types.js";

export type ApiHealth = {
  status: "ok" | "degraded";
  service: "api";
  database: "ok" | "unavailable";
};

/**
 * Quem chama a RPC: o admin repassa o header `cookie` do navegador (sessão Better Auth no
 * domínio do Painel) e o IP de `cf-connecting-ip` (rate limit). A api resolve sessão, papel e
 * Loja a partir disso — nunca de um id de usuário/Loja enviado pelo admin.
 */
export type PainelCaller = {
  cookie: string;
  ip: string | null;
};

export type StoreMemberView = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: ActiveStore["role"];
};

export interface PainelRpc {
  health(): Promise<ApiHealth>;

  /**
   * HTTP só pelo binding: o admin repassa `/api/auth/*` (Better Auth) para cá, com o header
   * `cf-connecting-ip` sobrescrito pelo próprio admin. Set-Cookie volta para o domínio do Painel.
   */
  fetch(request: Request): Promise<Response>;

  /** Sessão atual com a Loja ativa revalidada; null se não autenticado. */
  session(caller: PainelCaller): Promise<SessionCtx | null>;

  /** Troca a Loja ativa se houver membership; senão `forbidden` e nada muda. */
  switchActiveStore(
    caller: PainelCaller,
    input: SwitchActiveStoreInput,
  ): Promise<RpcResult<ActiveStore>>;

  /** Membros da Loja ativa (Dono). */
  listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>>;

  /**
   * Dono convida para a Loja ativa: cria o usuário se não existir, cria a membership e envia o
   * link de definir senha (token de uso único) pela MillionSend. Usuário já existente só ganha a
   * membership e um aviso por e-mail. Turnstile + rate limit.
   */
  inviteMember(
    caller: PainelCaller,
    input: InviteMemberInput,
  ): Promise<RpcResult<{ membershipId: string }>>;

  /** Ops convida o Dono de qualquer Loja; mesmo provisionamento de `inviteMember`. */
  opsInviteOwner(
    caller: PainelCaller,
    input: OpsInviteOwnerInput,
  ): Promise<RpcResult<{ membershipId: string }>>;

  /**
   * Dono remove membro da Loja ativa; o acesso cai na request seguinte (a membership é lida a
   * cada request). Sem outra membership, as sessões do usuário são revogadas.
   */
  removeMember(caller: PainelCaller, input: RemoveMemberInput): Promise<RpcResult<null>>;
}
