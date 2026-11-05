// Cupom no checkout (Ticket 13): resolve o Cupom da cotação e da criação no servidor, sobre o
// subtotal dos itens recalculado. Um Cupom por Pedido: código digitado (promocional) OU, sem
// código, o Cupom de boas-vindas automático da Loja quando a conta é elegível (decisão 66). O uso é
// conferido e contado de novo na escrita do Pedido (`db.storefront.createOrder`), de forma atômica.
import type { CreateOrderCoupon, CustomerAccount, FoodeDb } from "@foode/db";
import {
  type AppliedCoupon,
  type CouponUsageRule,
  evaluateCoupon,
  welcomeEligible,
} from "@foode/shared/coupon";
import type { CheckoutError } from "@foode/shared/order";

import type { CheckoutQuote } from "./checkout-rules";

export type CouponResolution =
  | { ok: true; coupon: CreateOrderCoupon | null; applied: AppliedCoupon | null }
  | { ok: false; error: CheckoutError };

const NO_COUPON: CouponResolution = { ok: true, coupon: null, applied: null };

export async function resolveCheckoutCoupon(
  db: FoodeDb,
  input: {
    storeId: string;
    couponCode: string | null;
    account: CustomerAccount | null;
    itemsSubtotalCents: number;
    now: Date;
  },
): Promise<CouponResolution> {
  const nowMs = input.now.getTime();
  if (input.couponCode) {
    const row = await db.storefront.couponByCode(input.storeId, input.couponCode);
    if (!row) return { ok: false, error: { code: "coupon_invalid", reason: "not_found" } };
    const evaluation = evaluateCoupon(row satisfies CouponUsageRule, {
      nowMs,
      itemsSubtotalCents: input.itemsSubtotalCents,
    });
    if (!evaluation.ok) {
      return {
        ok: false,
        error:
          evaluation.reason === "below_minimum"
            ? {
                code: "coupon_invalid",
                reason: "below_minimum",
                minimumCents: evaluation.minimumCents,
              }
            : // Inativo responde como inexistente: não confirma que o código existe.
              {
                code: "coupon_invalid",
                reason: evaluation.reason === "inactive" ? "not_found" : evaluation.reason,
              },
      };
    }
    return {
      ok: true,
      coupon: {
        source: "promo",
        couponId: row.id,
        version: row.updatedAt,
        discountCents: evaluation.discountCents,
      },
      applied: { source: "promo", code: row.code, discountCents: evaluation.discountCents },
    };
  }

  const account = input.account;
  if (!account) return NO_COUPON;
  const facts = await db.storefront.welcomeFacts({
    storeId: input.storeId,
    accountId: account.id,
    phoneE164: account.phoneE164,
  });
  const program = facts.program;
  if (
    !program ||
    !welcomeEligible({
      programActive: program.active,
      hasAccount: true,
      hasOrderInStore: facts.hasOrderInStore,
      alreadyRedeemedInStore: facts.alreadyRedeemed,
    })
  ) {
    return NO_COUPON;
  }
  const evaluation = evaluateCoupon(
    {
      ...program,
      startsOn: null,
      endsOn: null,
      weekdaysMask: 0,
      usageLimit: null,
      usedCount: 0,
    },
    { nowMs, itemsSubtotalCents: input.itemsSubtotalCents },
  );
  // Boas-vindas é automático: sem o mínimo, o Pedido segue sem desconto (sem erro).
  if (!evaluation.ok) return NO_COUPON;
  return {
    ok: true,
    coupon: {
      source: "welcome",
      version: program.updatedAt,
      accountId: account.id,
      accountPhoneE164: account.phoneE164,
      discountCents: evaluation.discountCents,
    },
    applied: { source: "welcome", code: null, discountCents: evaluation.discountCents },
  };
}

/** Cotação com o desconto do Cupom: só sobre os itens, nunca sobre a taxa de Delivery. */
export function withDiscount(quote: CheckoutQuote, discountCents: number): CheckoutQuote {
  const discount = Math.max(0, Math.min(discountCents, quote.subtotalCents));
  return {
    ...quote,
    discountCents: discount,
    totalCents: quote.subtotalCents + quote.deliveryFeeCents - discount,
  };
}
