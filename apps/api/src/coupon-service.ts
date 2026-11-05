// RPCs do Painel para Cupons (Ticket 13; CUP-01 a CUP-05, NAV-01 sob `store.settings`). Só o Dono
// da Loja ATIVA (política única); Operador e Ops = `forbidden`, sem efeito. Entradas validadas com
// @foode/shared/coupon (`invalid_input`); escritas em `db.store(context).coupons()` com auditoria.
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import {
  type CouponData,
  type CouponDiscountData,
  type CouponRowView,
  type FoodeDb,
  FoodeDbError,
  type StoreContext,
} from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  COUPON_TEMPLATES,
  couponCreateInputSchema,
  type CouponCreateData,
  type CouponDiscountRule,
  couponRefInputSchema,
  couponSetActiveInputSchema,
  type CouponsOverview,
  couponStatus,
  couponUpdateInputSchema,
  type CouponView,
  maskToWeekdays,
  weekdaysToMask,
  welcomeCouponInputSchema,
} from "@foode/shared/coupon";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { callerHeaders } from "./painel-service";

export type CouponServiceDeps = { db: FoodeDb; auth: FoodeAuth; now?: () => Date };

type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

function discountOf(data: {
  kind: "percent" | "fixed";
  percent?: number;
  maxDiscountCents?: number | null;
  amountCents?: number;
}): CouponDiscountData {
  return data.kind === "percent"
    ? {
        kind: "percent",
        percent: data.percent ?? 0,
        maxDiscountCents: data.maxDiscountCents ?? null,
      }
    : { kind: "fixed", amountCents: data.amountCents ?? 0 };
}

function toCouponData(data: CouponCreateData): CouponData {
  return {
    ...discountOf(data),
    code: data.code,
    minOrderCents: data.minOrderCents,
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    weekdaysMask: weekdaysToMask(data.weekdays),
    usageLimit: data.usageLimit,
    active: data.active,
  };
}

function discountRule(row: CouponDiscountData): CouponDiscountRule {
  return row.kind === "percent"
    ? { kind: "percent", percent: row.percent, maxDiscountCents: row.maxDiscountCents }
    : { kind: "fixed", amountCents: row.amountCents };
}

export function toCouponView(row: CouponRowView, nowMs: number): CouponView {
  return {
    id: row.id,
    code: row.code,
    discount: discountRule(row),
    minOrderCents: row.minOrderCents,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    weekdays: maskToWeekdays(row.weekdaysMask),
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    active: row.active,
    status: couponStatus(row, nowMs),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createCouponService(deps: CouponServiceDeps) {
  const { db, auth } = deps;
  const clock = deps.now ?? (() => new Date());

  async function asOwner<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, data: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("store.settings"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "store") return { ok: false, error: "forbidden" };
    try {
      return await operation(result.authorized.store, parsed.data);
    } catch (error) {
      if (error instanceof FoodeDbError) {
        return { ok: false, error: error.code === "slug_unavailable" ? "conflict" : error.code };
      }
      throw error;
    }
  }

  const couponsOf = (context: StoreContext) => db.store(context).coupons();
  const ok = <T>(data: T): RpcResult<T> => ({ ok: true, data });

  return {
    /** `/cupons`: boas-vindas no topo, lista (Código, Desconto, Mínimo, Validade, Usos, Status) e modelos. */
    couponsGet: (caller: PainelCaller) =>
      asOwner(caller, noInput, undefined, async (context): Promise<RpcResult<CouponsOverview>> => {
        const ops = couponsOf(context);
        const [rows, welcome] = await Promise.all([ops.list(), ops.welcome()]);
        const nowMs = clock().getTime();
        return ok({
          welcome: welcome
            ? {
                active: welcome.active,
                discount: discountRule(welcome),
                minOrderCents: welcome.minOrderCents,
                redeemedCount: welcome.redeemedCount,
              }
            : { active: false, discount: null, minOrderCents: null, redeemedCount: 0 },
          coupons: rows.map((row) => toCouponView(row, nowMs)),
          templates: COUPON_TEMPLATES,
        });
      }),

    /** Código repetido nesta Loja = `conflict`. */
    couponCreate: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, couponCreateInputSchema, input, async (context, data) =>
        ok(await couponsOf(context).create(toCouponData(data))),
      ),

    /** Formulário inteiro; limite abaixo dos usos ou código repetido = `conflict`. */
    couponUpdate: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, couponUpdateInputSchema, input, async (context, data) => {
        await couponsOf(context).update(data.couponId, toCouponData(data));
        return ok(null);
      }),

    couponSetActive: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, couponSetActiveInputSchema, input, async (context, data) => {
        await couponsOf(context).setActive(data.couponId, data.active);
        return ok(null);
      }),

    /** Só Cupom sem uso; com uso = `conflict` (desative). */
    couponDelete: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, couponRefInputSchema, input, async (context, data) => {
        await couponsOf(context).remove(data.couponId);
        return ok(null);
      }),

    /** Interruptor e desconto do Cupom de boas-vindas (CUP-04). */
    welcomeCouponSet: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, welcomeCouponInputSchema, input, async (context, data) => {
        await couponsOf(context).setWelcome({
          ...discountOf(data),
          active: data.active,
          minOrderCents: data.minOrderCents,
        });
        return ok(null);
      }),
  };
}

export type CouponService = ReturnType<typeof createCouponService>;
