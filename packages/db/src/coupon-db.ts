// Cupons no D1 (Ticket 13; decisões 45, 62, 63, 66).
// - Painel: só StoreContext de papel `owner` (a api já autorizou por `store.settings`; aqui é a
//   segunda barreira), sempre em `context.storeId`, com auditoria no mesmo batch. Id de Cupom de
//   outra Loja = `not_found`; código repetido NA LOJA = `conflict` (outra Loja pode usar o mesmo).
// - Checkout: leitura do Cupom e do programa de boas-vindas da Loja `active` do Slug; o uso é
//   conferido e contado na escrita do Pedido (storefront-order-db.ts), não aqui.
import { assertIssued, type StoreContext } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";

/** Desconto como gravado: % (teto opcional) ou R$. */
export type CouponDiscountData =
  | { kind: "percent"; percent: number; maxDiscountCents: number | null }
  | { kind: "fixed"; amountCents: number };

export type CouponData = CouponDiscountData & {
  code: string;
  minOrderCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  weekdaysMask: number;
  usageLimit: number | null;
  active: boolean;
};

export type CouponRowView = CouponData & {
  id: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WelcomeCouponData = CouponDiscountData & {
  active: boolean;
  minOrderCents: number | null;
};

export type WelcomeCouponRowView = WelcomeCouponData & { updatedAt: string; redeemedCount: number };

/** Fatos do boas-vindas para a cotação (a escrita do Pedido confere de novo). */
export type WelcomeCheckoutFacts = {
  program: (WelcomeCouponData & { updatedAt: string }) | null;
  hasOrderInStore: boolean;
  alreadyRedeemed: boolean;
};

export const COUPON_AUDIT_ACTIONS = [
  "coupon.created",
  "coupon.updated",
  "coupon.activated",
  "coupon.deactivated",
  "coupon.deleted",
  "coupon.welcome_updated",
] as const;

type CouponDbRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  percent: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  weekdays: number;
  usageLimit: number | null;
  usedCount: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

type WelcomeDbRow = {
  kind: "percent" | "fixed";
  percent: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  active: number;
  updatedAt: string;
};

const COUPON_COLUMNS = `id, code, kind, percent, amount_cents AS amountCents,
  max_discount_cents AS maxDiscountCents, min_order_cents AS minOrderCents,
  starts_on AS startsOn, ends_on AS endsOn, weekdays, usage_limit AS usageLimit,
  used_count AS usedCount, active, created_at AS createdAt, updated_at AS updatedAt`;

const WELCOME_COLUMNS = `kind, percent, amount_cents AS amountCents,
  max_discount_cents AS maxDiscountCents, min_order_cents AS minOrderCents, active,
  updated_at AS updatedAt`;

function discountOf(row: {
  kind: "percent" | "fixed";
  percent: number | null;
  amountCents: number | null;
  maxDiscountCents: number | null;
}): CouponDiscountData {
  return row.kind === "percent"
    ? { kind: "percent", percent: row.percent ?? 0, maxDiscountCents: row.maxDiscountCents }
    : { kind: "fixed", amountCents: row.amountCents ?? 0 };
}

export function toCouponRow(row: CouponDbRow): CouponRowView {
  return {
    ...discountOf(row),
    id: row.id,
    code: row.code,
    minOrderCents: row.minOrderCents,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    weekdaysMask: row.weekdays,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    active: row.active === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWelcome(row: WelcomeDbRow): WelcomeCouponData & { updatedAt: string } {
  return {
    ...discountOf(row),
    active: row.active === 1,
    minOrderCents: row.minOrderCents,
    updatedAt: row.updatedAt,
  };
}

function discountColumns(data: CouponDiscountData) {
  return data.kind === "percent"
    ? { percent: data.percent, amountCents: null, maxDiscountCents: data.maxDiscountCents }
    : { percent: null, amountCents: data.amountCents, maxDiscountCents: null };
}

function auditStatement(
  d1: D1Database,
  context: StoreContext,
  action: (typeof COUPON_AUDIT_ACTIONS)[number],
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
): D1PreparedStatement {
  return d1
    .prepare(
      `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
       VALUES (?, ?, ?, ?, ?, 'coupon', ?, ?)`,
    )
    .bind(
      newId(),
      now,
      context.userId,
      context.storeId,
      action,
      targetId,
      JSON.stringify(metadata),
    );
}

/** Painel do Dono (`/cupons`). */
export function createCouponOps(d1: D1Database, context: StoreContext) {
  assertIssued(context);
  if (context.role !== "owner") throw new FoodeDbError("forbidden");
  const storeId = context.storeId;

  async function couponById(couponId: string): Promise<CouponRowView | null> {
    const row = await d1
      .prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE store_id = ? AND id = ?`)
      .bind(storeId, couponId)
      .first<CouponDbRow>();
    return row ? toCouponRow(row) : null;
  }

  return {
    async list(): Promise<CouponRowView[]> {
      const { results } = await d1
        .prepare(
          `SELECT ${COUPON_COLUMNS} FROM coupons WHERE store_id = ? ORDER BY created_at DESC`,
        )
        .bind(storeId)
        .all<CouponDbRow>();
      return results.map(toCouponRow);
    },

    async welcome(): Promise<WelcomeCouponRowView | null> {
      const [program, count] = await d1.batch([
        d1
          .prepare(`SELECT ${WELCOME_COLUMNS} FROM store_welcome_coupons WHERE store_id = ?`)
          .bind(storeId),
        d1
          .prepare(
            `SELECT COUNT(*) AS redeemed FROM coupon_redemptions WHERE store_id = ? AND source = 'welcome'`,
          )
          .bind(storeId),
      ]);
      const row = (program?.results as WelcomeDbRow[] | undefined)?.[0];
      if (!row) return null;
      const redeemed = (count?.results as { redeemed: number }[] | undefined)?.[0]?.redeemed ?? 0;
      return { ...toWelcome(row), redeemedCount: redeemed };
    },

    get: couponById,

    /** Código repetido nesta Loja = `conflict`. */
    async create(data: CouponData): Promise<{ couponId: string }> {
      const couponId = newId();
      const now = utcNow();
      const discount = discountColumns(data);
      try {
        await d1.batch([
          d1
            .prepare(
              `INSERT INTO coupons (id, store_id, code, kind, percent, amount_cents, max_discount_cents,
                 min_order_cents, starts_on, ends_on, weekdays, usage_limit, used_count, active,
                 created_by_user_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            )
            .bind(
              couponId,
              storeId,
              data.code,
              data.kind,
              discount.percent,
              discount.amountCents,
              discount.maxDiscountCents,
              data.minOrderCents,
              data.startsOn,
              data.endsOn,
              data.weekdaysMask,
              data.usageLimit,
              data.active ? 1 : 0,
              context.userId,
              now,
              now,
            ),
          auditStatement(d1, context, "coupon.created", couponId, { code: data.code }, now),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new FoodeDbError("conflict");
        throw error;
      }
      return { couponId };
    },

    /**
     * Substitui os campos do Cupom (não mexe nos usos). Limite de usos abaixo do já usado =
     * `conflict`; código repetido nesta Loja = `conflict`; outra Loja/inexistente = `not_found`.
     */
    async update(couponId: string, data: CouponData): Promise<void> {
      const existing = await couponById(couponId);
      if (!existing) throw new FoodeDbError("not_found");
      if (data.usageLimit !== null && data.usageLimit < existing.usedCount) {
        throw new FoodeDbError("conflict", "limite abaixo dos usos");
      }
      const now = utcNow();
      const discount = discountColumns(data);
      try {
        const [update] = await d1.batch([
          d1
            .prepare(
              `UPDATE coupons SET code = ?, kind = ?, percent = ?, amount_cents = ?,
                 max_discount_cents = ?, min_order_cents = ?, starts_on = ?, ends_on = ?,
                 weekdays = ?, usage_limit = ?, active = ?, updated_at = ?
               WHERE store_id = ? AND id = ?`,
            )
            .bind(
              data.code,
              data.kind,
              discount.percent,
              discount.amountCents,
              discount.maxDiscountCents,
              data.minOrderCents,
              data.startsOn,
              data.endsOn,
              data.weekdaysMask,
              data.usageLimit,
              data.active ? 1 : 0,
              now,
              storeId,
              couponId,
            ),
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, store_id, 'coupon.updated', 'coupon', id, ?
               FROM coupons WHERE store_id = ? AND id = ? AND updated_at = ?`,
            )
            .bind(
              newId(),
              now,
              context.userId,
              JSON.stringify({ before: { code: existing.code }, after: { code: data.code } }),
              storeId,
              couponId,
              now,
            ),
        ]);
        if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("not_found");
      } catch (error) {
        if (isUniqueViolation(error)) throw new FoodeDbError("conflict");
        // CHECK `used_count <= usage_limit` (uso concorrente entre a leitura e a escrita).
        if (error instanceof Error && /CHECK constraint failed/u.test(String(error.message))) {
          throw new FoodeDbError("conflict");
        }
        throw error;
      }
    },

    async setActive(couponId: string, active: boolean): Promise<void> {
      const now = utcNow();
      const [update] = await d1.batch([
        d1
          .prepare(`UPDATE coupons SET active = ?, updated_at = ? WHERE store_id = ? AND id = ?`)
          .bind(active ? 1 : 0, now, storeId, couponId),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, store_id, ?, 'coupon', id, '{}' FROM coupons WHERE store_id = ? AND id = ?`,
          )
          .bind(
            newId(),
            now,
            context.userId,
            active ? "coupon.activated" : "coupon.deactivated",
            storeId,
            couponId,
          ),
      ]);
      if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("not_found");
    },

    /** Só sem usos (os Pedidos guardam o uso); com uso = `conflict` (desative). */
    async remove(couponId: string): Promise<void> {
      const existing = await couponById(couponId);
      if (!existing) throw new FoodeDbError("not_found");
      const now = utcNow();
      const unused = `store_id = ? AND id = ? AND used_count = 0
        AND NOT EXISTS (SELECT 1 FROM coupon_redemptions r WHERE r.store_id = ? AND r.coupon_id = ?)`;
      try {
        const [, removal] = await d1.batch([
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, store_id, 'coupon.deleted', 'coupon', id, json_object('code', code)
               FROM coupons WHERE ${unused}`,
            )
            .bind(newId(), now, context.userId, storeId, couponId, storeId, couponId),
          d1
            .prepare(`DELETE FROM coupons WHERE ${unused}`)
            .bind(storeId, couponId, storeId, couponId),
        ]);
        if ((removal?.meta.changes ?? 0) === 0)
          throw new FoodeDbError("conflict", "cupom com usos");
      } catch (error) {
        if (error instanceof Error && /FOREIGN KEY constraint failed/u.test(error.message)) {
          throw new FoodeDbError("conflict");
        }
        throw error;
      }
    },

    /** Programa de boas-vindas da Loja (UPSERT da linha 1:1). */
    async setWelcome(data: WelcomeCouponData): Promise<void> {
      const now = utcNow();
      const discount = discountColumns(data);
      await d1.batch([
        d1
          .prepare(
            `INSERT INTO store_welcome_coupons (store_id, active, kind, percent, amount_cents,
               max_discount_cents, min_order_cents, updated_by_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(store_id) DO UPDATE SET active = excluded.active, kind = excluded.kind,
               percent = excluded.percent, amount_cents = excluded.amount_cents,
               max_discount_cents = excluded.max_discount_cents,
               min_order_cents = excluded.min_order_cents,
               updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
          )
          .bind(
            storeId,
            data.active ? 1 : 0,
            data.kind,
            discount.percent,
            discount.amountCents,
            discount.maxDiscountCents,
            data.minOrderCents,
            context.userId,
            now,
            now,
          ),
        auditStatement(
          d1,
          context,
          "coupon.welcome_updated",
          storeId,
          { active: data.active },
          now,
        ),
      ]);
    },
  };
}

/** Leituras do checkout (Loja já resolvida pelo Slug como `active`). */
export function createCouponCheckoutOps(d1: D1Database) {
  return {
    /** Cupom da Loja pelo código (já normalizado); outra Loja nunca. */
    async couponByCode(storeId: string, code: string): Promise<CouponRowView | null> {
      const row = await d1
        .prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE store_id = ? AND code = ?`)
        .bind(storeId, code)
        .first<CouponDbRow>();
      return row ? toCouponRow(row) : null;
    },

    /**
     * Fatos do boas-vindas: programa da Loja, se a conta (ou o telefone verificado dela) já tem
     * Pedido NESTA Loja (PIX nunca pago e cancelado não conta, Ticket 12) e se já usou o
     * boas-vindas aqui.
     */
    async welcomeFacts(input: {
      storeId: string;
      accountId: string;
      phoneE164: string;
    }): Promise<WelcomeCheckoutFacts> {
      const [program, orders, redeemed] = await d1.batch([
        d1
          .prepare(`SELECT ${WELCOME_COLUMNS} FROM store_welcome_coupons WHERE store_id = ?`)
          .bind(input.storeId),
        d1
          .prepare(
            `SELECT 1 AS found FROM orders WHERE store_id = ?
               AND (customer_account_id = ? OR customer_phone_e164 = ?)
               AND NOT (status = 'cancelled' AND payment_status IN ('awaiting', 'expired', 'failed'))
             LIMIT 1`,
          )
          .bind(input.storeId, input.accountId, input.phoneE164),
        d1
          .prepare(
            `SELECT 1 AS found FROM coupon_redemptions WHERE store_id = ? AND source = 'welcome'
               AND customer_account_id = ? LIMIT 1`,
          )
          .bind(input.storeId, input.accountId),
      ]);
      const row = (program?.results as WelcomeDbRow[] | undefined)?.[0];
      return {
        program: row ? toWelcome(row) : null,
        hasOrderInStore: Boolean((orders?.results as unknown[] | undefined)?.length),
        alreadyRedeemed: Boolean((redeemed?.results as unknown[] | undefined)?.length),
      };
    },
  };
}

export type CouponOps = ReturnType<typeof createCouponOps>;
