// RPCs da área Ops (Ticket 29). Cada método valida a entrada com o schema de @foode/shared/ops,
// autoriza só `foode_ops` (OpsContext emitido por @foode/db) e opera em `db.ops(context)`, que
// grava a auditoria `before`/`after` no mesmo batch de cada mutação.
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
// Erros de regra do banco viram código: `not_found`, `conflict` (Slug usado, vigência
// sobreposta, transição ou ativação recusada, escrita concorrente) e `invalid_input`.
// O convite (e reenvio) do Dono é `opsInviteOwner` (painel-service.ts, fluxo do Ticket 22).
import { type FoodeDb, FoodeDbError, type FoodeDbErrorCode, type OpsContext } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import {
  type AuthErrorCode,
  type RpcResult,
  type StoreStatus,
  storeStatusSchema,
} from "@foode/shared/auth";
import {
  canTransitionStore,
  findFeeOverlap,
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
  periodsOverlap,
  type PlanTierTableView,
  type ProviderCostView,
} from "@foode/shared/ops";

import {
  type LeadView,
  opsListLeadsInputSchema,
  opsSetLeadStatusInputSchema,
} from "@foode/shared/lead";

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

const DB_ERRORS: Record<FoodeDbErrorCode, AuthErrorCode> = {
  forbidden: "forbidden",
  invalid_input: "invalid_input",
  not_found: "not_found",
  conflict: "conflict",
  slug_unavailable: "conflict",
};

/** Estados de onde a transição para `to` vale (STORE_STATUS_TRANSITIONS). */
function allowedFrom(to: StoreStatus): StoreStatus[] {
  return storeStatusSchema.options.filter((from) => canTransitionStore(from, to));
}

export function createOpsService(deps: OpsServiceDeps) {
  const { db, auth } = deps;

  /**
   * Valida, resolve a sessão e exige OpsContext; só então chama `operation`. Dono/Operador
   * (mesmo com Loja ativa) recebem `forbidden` sem nenhum efeito. FoodeDbError vira código.
   */
  async function asOps<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (ops: ReturnType<FoodeDb["ops"]>, input: O, context: OpsContext) => Promise<T>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("ops.area"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "ops") return { ok: false, error: "forbidden" };
    const context = result.authorized.ops;
    try {
      return { ok: true, data: await operation(db.ops(context), parsed.data, context) };
    } catch (error) {
      if (error instanceof FoodeDbError) return { ok: false, error: DB_ERRORS[error.code] };
      throw error;
    }
  }

  return {
    opsListStores: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, async (ops): Promise<OpsStoreListItem[]> =>
        ops.listStores(),
      ),

    opsGetStore: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsStoreRefInputSchema,
        input,
        // O D1 guarda a UF como TEXT (CHECK de tamanho); só o Zod da entrada a restringe ao enum.
        async (ops, { storeId }) => (await ops.getStore(storeId)) as OpsStoreDetail,
      ),

    opsCreateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreateStoreInputSchema, input, (ops, data) => ops.createStore(data)),

    opsUpdateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsUpdateStoreInputSchema, input, async (ops, { storeId, ...patch }) => {
        await ops.updateStore(storeId, patch);
        return null;
      }),

    /** Ativa (de `onboarding`) ou reativa (de `suspended`); exige ACTIVATION_REQUIRED_CHECKS. */
    opsActivateStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsActivateStoreInputSchema, input, async (ops, { storeId }) => {
        await ops.changeStoreStatus(storeId, "active", { allowedFrom: allowedFrom("active") });
        return null;
      }),

    opsSuspendStore: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSuspendStoreInputSchema, input, async (ops, { storeId, reason }) => {
        await ops.changeStoreStatus(storeId, "suspended", {
          allowedFrom: allowedFrom("suspended"),
          reason,
        });
        return null;
      }),

    opsSetCardMode: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSetCardModeInputSchema, input, async (ops, { storeId, cardMode }) => {
        await ops.setCardMode(storeId, cardMode);
        return null;
      }),

    opsSetStorePlan: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSetStorePlanInputSchema, input, (ops, { storeId, cycle, validFrom }) =>
        ops.setStorePlan(storeId, { cycle, validFrom }),
      ),

    opsListPlanTiers: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, async (ops): Promise<PlanTierTableView[]> =>
        ops.listPlanTierTables(),
      ),

    opsPublishPlanTiers: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsPublishPlanTiersInputSchema, input, async (ops, data) => {
        await ops.publishPlanTiers(data);
        return null;
      }),

    opsListPaymentFees: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsListPaymentFeesInputSchema,
        input,
        async (ops, { storeId }): Promise<PaymentFeeView[]> => ops.listPaymentFees(storeId),
      ),

    /**
     * Confere a sobreposição contra o gravado com a mesma `findFeeOverlap` do Zod (resposta
     * rápida) e o banco confere de novo no INSERT…SELECT do batch (corrida entre dois Ops).
     */
    opsCreatePaymentFees: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreatePaymentFeesInputSchema, input, async (ops, { storeId, fees }) => {
        const recorded = await ops.listPaymentFees(storeId);
        if (findFeeOverlap([...recorded, ...fees])) throw new FoodeDbError("conflict");
        return ops.createPaymentFees(storeId, fees);
      }),

    opsEndPaymentFee: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsEndPaymentFeeInputSchema, input, async (ops, { feeId, validTo }) => {
        await ops.endPaymentFee(feeId, validTo);
        return null;
      }),

    opsListProviderCosts: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, async (ops): Promise<ProviderCostView[]> =>
        ops.listProviderCosts(),
      ),

    opsCreateProviderCost: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCreateProviderCostInputSchema, input, async (ops, cost) => {
        const recorded = await ops.listProviderCosts();
        const overlaps = recorded.some(
          (row) =>
            row.provider === cost.provider &&
            row.operation === cost.operation &&
            periodsOverlap(row, cost),
        );
        if (overlaps) throw new FoodeDbError("conflict");
        return ops.createProviderCost(cost);
      }),

    opsEndProviderCost: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsEndProviderCostInputSchema, input, async (ops, { costId, validTo }) => {
        await ops.endProviderCost(costId, validTo);
        return null;
      }),

    opsListStoreAudit: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsStoreRefInputSchema,
        input,
        async (ops, { storeId }): Promise<OpsAuditEntry[]> => ops.storeAudit(storeId),
      ),

    // ---- Leads da landing (Ticket 31, decisão 70).

    opsListLeads: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsListLeadsInputSchema, input, async (ops, { status }): Promise<LeadView[]> =>
        ops.listLeads({ status }),
      ),

    opsSetLeadStatus: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsSetLeadStatusInputSchema, input, async (ops, { leadId, status }) => {
        await ops.setLeadStatus(leadId, status);
        return null;
      }),
  };
}

export type OpsService = ReturnType<typeof createOpsService>;
