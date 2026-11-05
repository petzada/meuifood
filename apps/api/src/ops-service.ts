// RPCs da área Ops (Ticket 29). CONTRATO: cada método já valida a entrada com o schema de
// @foode/shared/ops e autoriza só `foode_ops` (OpsContext emitido por @foode/db); a regra de
// negócio ainda devolve `not_implemented` — a fatia API do Ticket 29 troca o corpo de `run`
// por operação em `db.ops(context)`, com auditoria `before`/`after`.
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import type { FoodeDb, OpsContext } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  opsActivateStoreInputSchema,
  type OpsAuditEntry,
  opsCreatePaymentFeesInputSchema,
  opsCreateProviderCostInputSchema,
  opsCreateStoreInputSchema,
  opsEndPaymentFeeInputSchema,
  opsEndProviderCostInputSchema,
  opsListPaymentFeesInputSchema,
  opsPublishPlanTiersInputSchema,
  opsSetCardModeInputSchema,
  opsSetStorePlanInputSchema,
  type OpsStoreDetail,
  type OpsStoreListItem,
  opsStoreRefInputSchema,
  opsSuspendStoreInputSchema,
  opsUpdateStoreInputSchema,
  type PaymentFeeView,
  type PlanTierTableView,
  type ProviderCostView,
} from "@foode/shared/ops";
import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { callerHeaders } from "./painel-service";

export type OpsServiceDeps = { db: FoodeDb; auth: FoodeAuth };

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

/** RPC sem entrada. */
const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

export function createOpsService(deps: OpsServiceDeps) {
  const { db, auth } = deps;

  /**
   * Valida, resolve a sessão e exige OpsContext; só então chama `operation`. Dono/Operador
   * (mesmo com Loja ativa) recebem `forbidden` sem nenhum efeito.
   */
  async function asOps<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: OpsContext, input: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("ops.area"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "ops") return { ok: false, error: "forbidden" };
    return operation(result.authorized.ops, parsed.data);
  }

  /** Corpo provisório do contrato: autorizado, mas sem regra de negócio ainda. */
  async function notImplemented<T>(): Promise<RpcResult<T>> {
    return { ok: false, error: "not_implemented" };
  }

  return {
    opsListStores: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, notImplemented<OpsStoreListItem[]>),
    opsGetStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsStoreRefInputSchema, input, notImplemented<OpsStoreDetail>),
    opsCreateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreateStoreInputSchema, input, notImplemented<{ storeId: string }>),
    opsUpdateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsUpdateStoreInputSchema, input, notImplemented<null>),
    opsActivateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsActivateStoreInputSchema, input, notImplemented<null>),
    opsSuspendStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSuspendStoreInputSchema, input, notImplemented<null>),
    opsSetCardMode: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSetCardModeInputSchema, input, notImplemented<null>),
    opsSetStorePlan: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSetStorePlanInputSchema, input, notImplemented<{ planId: string }>),
    opsListPlanTiers: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, notImplemented<PlanTierTableView[]>),
    opsPublishPlanTiers: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsPublishPlanTiersInputSchema, input, notImplemented<null>),
    opsListPaymentFees: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsListPaymentFeesInputSchema, input, notImplemented<PaymentFeeView[]>),
    opsCreatePaymentFees: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreatePaymentFeesInputSchema, input, notImplemented<{ feeIds: string[] }>),
    opsEndPaymentFee: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsEndPaymentFeeInputSchema, input, notImplemented<null>),
    opsListProviderCosts: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, notImplemented<ProviderCostView[]>),
    opsCreateProviderCost: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreateProviderCostInputSchema, input, notImplemented<{ costId: string }>),
    opsEndProviderCost: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsEndProviderCostInputSchema, input, notImplemented<null>),
    opsListStoreAudit: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsStoreRefInputSchema, input, notImplemented<OpsAuditEntry[]>),
  };
}

export type OpsService = ReturnType<typeof createOpsService>;
