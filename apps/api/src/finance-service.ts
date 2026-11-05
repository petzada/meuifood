// RPCs do financeiro (Ticket 14; REL-01..04, OPS-04, NAV-01/02; decisões 60, 61, 64 e 71).
// Dono: relatórios, CSV e Repasses — permissão `store.finance` da política única (só `owner`);
// Operador e Ops = `forbidden`, sem efeito. Ops (`ops.area`): "A repassar hoje", marcar lote pago,
// ajuste auditado, lotes e margem. Ordem: validar entrada → sessão → autorizar → operar.
// "Hoje" é sempre o dia civil de São Paulo do relógio do servidor (nunca do request).
// Nada aqui registra log com dado pessoal; o TOP 10 clientes sai só com nome, quantidade e total
// (base legal citada em @foode/db report-db.ts e @foode/shared/finance report.ts).
import {
  type FoodeDb,
  FoodeDbError,
  type FoodeDbErrorCode,
  type OwnerPayoutLineRow,
  type PayoutBatchRowView,
  type StoreContext,
} from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { AuthErrorCode, RpcResult } from "@foode/shared/auth";
import {
  buildFinanceReport,
  buildMarginView,
  civilRangeUtc,
  CSV_CONTENT_TYPE,
  type FinanceReport,
  isPayableBatch,
  type OpsMarginView,
  type OpsPayoutBatchView,
  type OpsPayoutDueStoreView,
  type OpsPayoutMarkPaidResult,
  type OpsPayoutsDueView,
  opsMarginInputSchema,
  opsPayoutAdjustmentInputSchema,
  opsPayoutBatchesInputSchema,
  opsPayoutMarkPaidInputSchema,
  type OwnerPayoutBatchView,
  ownerPayoutsInputSchema,
  type OwnerPayoutsView,
  payoutBatchTotals,
  payoutLineStatus,
  type PayoutLineView,
  payoutStatusTotals,
  type ReportCsvExport,
  reportCsv,
  reportCsvFilename,
  reportInputSchema,
  resolveReportPeriod,
} from "@foode/shared/finance";
import { buildFunnelReport } from "@foode/shared/onboarding";
import { isBusinessDay, saoPauloDate } from "@foode/shared/payment";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { callerHeaders } from "./painel-service";

export type FinanceServiceDeps = { db: FoodeDb; auth: FoodeAuth; now?: () => Date };

type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

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

const ok = <T>(data: T): RpcResult<T> => ({ ok: true, data });
const invalid = { ok: false, error: "invalid_input" } as const;

/** Lote visto pelo Dono: sem custo do envio nem quem marcou (decisão 61). */
export function toOwnerBatch(row: PayoutBatchRowView): OwnerPayoutBatchView {
  return {
    id: row.id,
    payoutDate: row.payoutDate,
    paidOn: row.paidOn,
    sourceAccount: row.sourceAccount,
    reference: row.reference,
    entriesCents: row.entriesCents,
    debitsCents: row.debitsCents,
    adjustmentsCents: row.adjustmentsCents,
    amountCents: row.amountCents,
    itemCount: row.itemCount,
  };
}

export function toPayoutLine(row: OwnerPayoutLineRow, today: string): PayoutLineView {
  return {
    id: row.id,
    kind: row.kind,
    status: payoutLineStatus({
      kind: row.kind,
      paid: row.paid === 1,
      annulled: row.annulled === 1,
      dueDate: row.expectedPayoutDate,
      today,
    }),
    orderCode: row.orderCode,
    method: row.method,
    cardMode: row.cardMode,
    orderTotalCents: row.orderTotalCents,
    foodeFeeCents: row.foodeFeeCents,
    serviceFeeCents: row.serviceFeeCents,
    netCents: row.netCents,
    expectedPayoutDate: row.expectedPayoutDate,
    batchId: row.batchId,
    reason: row.reason,
    occurredAt: row.occurredAt,
  };
}

export function createFinanceService(deps: FinanceServiceDeps) {
  const { db, auth } = deps;
  const clock = deps.now ?? (() => new Date());
  const today = () => saoPauloDate(clock());

  async function guarded<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    permission: "store.finance" | "ops.area",
    operation: (
      authorized: { store: StoreContext } | { ops: ReturnType<FoodeDb["ops"]> },
      data: O,
    ) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return invalid;
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith(permission));
    if (!result.ok) return { ok: false, error: result.error };
    const { authorized } = result;
    const wanted = permission === "ops.area" ? "ops" : "store";
    if (authorized.kind !== wanted) return { ok: false, error: "forbidden" };
    try {
      return await operation(
        authorized.kind === "store" ? { store: authorized.store } : { ops: db.ops(authorized.ops) },
        parsed.data,
      );
    } catch (error) {
      if (error instanceof FoodeDbError) return { ok: false, error: DB_ERRORS[error.code] };
      throw error;
    }
  }

  function asOwner<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, data: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    return guarded(caller, schema, input, "store.finance", (authorized, data) =>
      operation((authorized as { store: StoreContext }).store, data),
    );
  }

  function asOps<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (ops: ReturnType<FoodeDb["ops"]>, data: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    return guarded(caller, schema, input, "ops.area", (authorized, data) =>
      operation((authorized as { ops: ReturnType<FoodeDb["ops"]> }).ops, data),
    );
  }

  async function reportOf(
    context: StoreContext,
    period: Parameters<typeof resolveReportPeriod>[0],
  ): Promise<FinanceReport | null> {
    const resolved = resolveReportPeriod(period, today());
    if (!resolved) return null;
    const rows = await db
      .store(context)
      .reports()
      .report({
        current: civilRangeUtc(resolved.from, resolved.to),
        previous: civilRangeUtc(resolved.previous.from, resolved.previous.to),
        from: resolved.from,
        to: resolved.to,
      });
    return buildFinanceReport({
      period: resolved,
      current: rows.current,
      previous: rows.previous,
      items: rows.items,
      customers: rows.customers,
      funnel: buildFunnelReport(resolved.from, resolved.to, rows.funnel),
    });
  }

  return {
    /** Relatório da Loja ativa (só Dono). Personalizado com fim no futuro = `invalid_input`. */
    reportsGet: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, reportInputSchema, input, async (context, { period }) => {
        const report = await reportOf(context, period);
        return report ? ok(report) : invalid;
      }),

    /** CSV dos agregados (sem TOP 10 clientes nem dado pessoal; decisão 64). */
    reportsExportCsv: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        reportInputSchema,
        input,
        async (context, { period }): Promise<RpcResult<ReportCsvExport>> => {
          const [report, store] = await Promise.all([
            reportOf(context, period),
            db.store(context).get(),
          ]);
          if (!report) return invalid;
          return ok({
            filename: reportCsvFilename(store.slug, report),
            contentType: CSV_CONTENT_TYPE,
            csv: reportCsv(report),
          });
        },
      ),

    /** Repasses do Dono: lançamentos com status, totais e lotes pagos (só leitura). */
    payoutsGet: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        ownerPayoutsInputSchema,
        input,
        async (context, { from, to }): Promise<RpcResult<OwnerPayoutsView>> => {
          const payouts = db.store(context).payouts();
          const current = today();
          const [rows, batches] = await Promise.all([
            payouts.lines({ from, to, ...civilRangeUtc(from, to) }),
            payouts.batches(from, to),
          ]);
          const lines = rows.map((row) => toPayoutLine(row, current));
          return ok({
            from,
            to,
            today: current,
            lines,
            totals: payoutStatusTotals(lines),
            batches: batches.map(toOwnerBatch),
          });
        },
      ),

    /** "A repassar hoje" por Loja (itens com previsão até hoje), com a conta de repasse. */
    opsPayoutsDue: (caller: PainelCaller) =>
      asOps(caller, noInput, undefined, async (ops): Promise<RpcResult<OpsPayoutsDueView>> => {
        const asOf = today();
        const { items, stores } = await ops.payoutsDue(asOf);
        const byStore = new Map<string, typeof items>();
        for (const item of items) {
          const list = byStore.get(item.storeId) ?? [];
          list.push(item);
          byStore.set(item.storeId, list);
        }
        const views: OpsPayoutDueStoreView[] = stores.map((store) => {
          const storeItems = byStore.get(store.storeId) ?? [];
          const totals = payoutBatchTotals(storeItems);
          const payout =
            store.pixKeyType && store.pixKey && store.holderName
              ? { pixKeyType: store.pixKeyType, pixKey: store.pixKey, holderName: store.holderName }
              : null;
          return {
            storeId: store.storeId,
            storeName: store.storeName,
            storeSlug: store.storeSlug,
            payout,
            ...totals,
            payable: payout !== null && isPayableBatch(totals),
            items: storeItems.map((item) => ({
              kind: item.kind,
              id: item.id,
              amountCents: item.amountCents,
              orderCode: item.orderCode,
              method: item.method,
              expectedPayoutDate: item.expectedPayoutDate,
              reason: item.reason,
            })),
          };
        });
        views.sort(
          (a, b) => b.amountCents - a.amountCents || a.storeName.localeCompare(b.storeName),
        );
        return ok({ asOf, isBusinessDay: isBusinessDay(asOf), stores: views });
      }),

    /** Marca o lote pago (idempotente; imutável depois). Datas no futuro = `invalid_input`. */
    opsPayoutMarkPaid: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsPayoutMarkPaidInputSchema,
        input,
        async (ops, data): Promise<RpcResult<OpsPayoutMarkPaidResult>> => {
          const current = today();
          if (data.asOf > current || data.paidOn > current) return invalid;
          return ok(await ops.markPayoutBatchPaid(data));
        },
      ),

    /** Ajuste auditado (crédito/débito) que entra no próximo lote da Loja. */
    opsPayoutAdjustmentCreate: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsPayoutAdjustmentInputSchema, input, async (ops, data) =>
        ok(await ops.createPayoutAdjustment(data)),
      ),

    /** Lotes de uma Loja no período (com custo do envio). */
    opsPayoutBatches: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsPayoutBatchesInputSchema,
        input,
        async (ops, { storeId, from, to }): Promise<RpcResult<OpsPayoutBatchView[]>> => {
          const rows = await ops.payoutBatches(storeId, from, to);
          return ok(
            rows.map((row) => ({
              ...toOwnerBatch(row),
              storeId: row.storeId,
              transferCostCents: row.transferCostCents,
              createdByUserId: row.createdByUserId,
              createdAt: row.createdAt,
            })),
          );
        },
      ),

    /** Margem por Loja: taxa Foode − custo do provedor − envio; tarifa de serviço à parte. */
    opsMarginReport: (caller: PainelCaller, input: unknown) =>
      asOps(
        caller,
        opsMarginInputSchema,
        input,
        async (ops, { from, to }): Promise<RpcResult<OpsMarginView>> =>
          ok(
            buildMarginView(
              from,
              to,
              await ops.marginByStore({ from, to, ...civilRangeUtc(from, to) }),
            ),
          ),
      ),
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
