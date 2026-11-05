import { COUPON_TEMPLATES } from "@foode/shared/coupon";
import Link from "next/link";

import { EMPTY_COUPON } from "../../../../lib/coupon-forms";
import { requirePermission } from "../../../../lib/session";
import { CouponForm } from "../_components/coupon-form";
import { createCoupon } from "../actions";

// Novo Cupom (CUP-02/CUP-03/CUP-05): formulário numa página com modelos que só preenchem.
export const dynamic = "force-dynamic";

export default async function NewCouponPage() {
  await requirePermission("store.settings");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <nav aria-label="Caminho" className="text-sm font-bold text-[var(--color-muted)]">
          <Link href="/cupons" className="underline-offset-4 hover:underline">
            Cupons
          </Link>
          <span aria-hidden="true"> › </span>
        </nav>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Novo Cupom
        </h1>
      </header>
      <CouponForm
        action={createCoupon}
        initial={EMPTY_COUPON}
        mode="create"
        templates={COUPON_TEMPLATES}
      />
    </section>
  );
}
