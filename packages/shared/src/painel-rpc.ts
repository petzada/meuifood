// Contrato do service binding admin → api (entrypoint `PainelApi`, RPC). O navegador do
// Painel nunca fala com a api: o servidor do admin chama estes métodos pelo binding `API`.
import type {
  InviteMemberInput,
  OpsInviteOwnerInput,
  RemoveMemberInput,
  SwitchActiveStoreInput,
} from "./auth/schemas.js";
import type { ActiveStore, RpcResult, SessionCtx } from "./auth/types.js";
import type {
  OpsActivateStoreInput,
  OpsAuditEntry,
  OpsCreatePaymentFeesInput,
  OpsCreateProviderCostInput,
  OpsCreateStoreInput,
  OpsEndPaymentFeeInput,
  OpsEndProviderCostInput,
  OpsListPaymentFeesInput,
  OpsPublishPlanTiersInput,
  OpsSetCardModeInput,
  OpsSetStorePlanInput,
  OpsStoreDetail,
  OpsStoreListItem,
  OpsStoreRefInput,
  OpsSuspendStoreInput,
  OpsUpdateStoreInput,
  PaymentFeeView,
  PlanTierTableView,
  ProviderCostView,
} from "./ops/index.js";

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

  // ---- Área Ops (Ticket 29). Só `foode_ops` (OpsContext emitido por @foode/db); Dono e
  // Operador recebem `forbidden`. Entradas validadas com os schemas de `@foode/shared/ops`
  // (`invalid_input`). Toda mutação grava auditoria com `before`/`after` (OPS_AUDIT_ACTIONS).

  /** Lojas com estado, Plano, faixa do mês e checklist de onboarding. */
  opsListStores(caller: PainelCaller): Promise<RpcResult<OpsStoreListItem[]>>;

  /** Detalhe da Loja; `not_found` se não existe. */
  opsGetStore(caller: PainelCaller, input: OpsStoreRefInput): Promise<RpcResult<OpsStoreDetail>>;

  /** Cadastra a Loja em `onboarding`. Slug já usado = `conflict`. O convite do Dono é `opsInviteOwner`. */
  opsCreateStore(
    caller: PainelCaller,
    input: OpsCreateStoreInput,
  ): Promise<RpcResult<{ storeId: string }>>;

  /** Edita o cadastro (só os campos enviados). Slug já usado = `conflict`. */
  opsUpdateStore(caller: PainelCaller, input: OpsUpdateStoreInput): Promise<RpcResult<null>>;

  /**
   * Ativa (de `onboarding`) ou reativa (de `suspended`). Exige Plano vigente; transição fora de
   * STORE_STATUS_TRANSITIONS ou sem Plano = `conflict`.
   */
  opsActivateStore(caller: PainelCaller, input: OpsActivateStoreInput): Promise<RpcResult<null>>;

  /** Suspende a Loja (para de aceitar Pedidos); motivo na auditoria. */
  opsSuspendStore(caller: PainelCaller, input: OpsSuspendStoreInput): Promise<RpcResult<null>>;

  /** Modo do cartão da Loja (Normal = Efí, Rápido = AbacatePay). */
  opsSetCardMode(caller: PainelCaller, input: OpsSetCardModeInput): Promise<RpcResult<null>>;

  /** Plano da Loja (mensal/anual) a partir de `validFrom`; encerra o anterior. */
  opsSetStorePlan(
    caller: PainelCaller,
    input: OpsSetStorePlanInput,
  ): Promise<RpcResult<{ planId: string }>>;

  /** Tabelas de faixas (vigente, futuras e histórico), mais recente primeiro. */
  opsListPlanTiers(caller: PainelCaller): Promise<RpcResult<PlanTierTableView[]>>;

  /** Publica nova tabela de faixas a partir de `validFrom`; a vigente termina ali. */
  opsPublishPlanTiers(
    caller: PainelCaller,
    input: OpsPublishPlanTiersInput,
  ): Promise<RpcResult<null>>;

  /** Taxas Foode da tabela padrão (`storeId` null) ou overrides da Loja, com histórico. */
  opsListPaymentFees(
    caller: PainelCaller,
    input: OpsListPaymentFeesInput,
  ): Promise<RpcResult<PaymentFeeView[]>>;

  /** Cadastra taxas; sobreposição com o que já está gravado no mesmo meio/modo = `conflict`. */
  opsCreatePaymentFees(
    caller: PainelCaller,
    input: OpsCreatePaymentFeesInput,
  ): Promise<RpcResult<{ feeIds: string[] }>>;

  /** Encerra a vigência de uma taxa (`validTo`); não apaga nem reescreve. */
  opsEndPaymentFee(caller: PainelCaller, input: OpsEndPaymentFeeInput): Promise<RpcResult<null>>;

  /** Custos dos provedores (Ops-only), com histórico. */
  opsListProviderCosts(caller: PainelCaller): Promise<RpcResult<ProviderCostView[]>>;

  /** Novo custo de provedor; sobreposição no mesmo provedor/operação = `conflict`. */
  opsCreateProviderCost(
    caller: PainelCaller,
    input: OpsCreateProviderCostInput,
  ): Promise<RpcResult<{ costId: string }>>;

  /** Encerra a vigência de um custo de provedor. */
  opsEndProviderCost(
    caller: PainelCaller,
    input: OpsEndProviderCostInput,
  ): Promise<RpcResult<null>>;

  /** Trilha de auditoria da Loja (mais recente primeiro). */
  opsListStoreAudit(
    caller: PainelCaller,
    input: OpsStoreRefInput,
  ): Promise<RpcResult<OpsAuditEntry[]>>;
}
