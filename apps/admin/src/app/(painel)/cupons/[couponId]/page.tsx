import Link from "next/link";
import { notFound } from "next/navigation";

import { couponFormValues } from "../../../../lib/coupon-forms";
import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { CouponForm } from "../_components/coupon-form";
import { CouponStatusBadge } from "../_components/coupon-table";
import { updateCoupon } from "../actions";

// Editar Cupom: o mesmo formulário com "Salvar alterações" só com mudança (T-06). Cupom de
// outra Loja ou inexistente = 404 (a lista vem da RPC da Loja ativa).
export const dynamic = "force-dynamic";

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ couponId: string }>;
}) {
  await requirePermission("store.settings");
  const { couponId } = await params;
  const overview = await painelRead("os Cupons", (api, caller) => api.couponsGet(caller));
  const coupon = overview.coupons.find((item) => item.id === couponId);
  if (!coupon) notFound();
  const action = updateCoupon.bind(null, coupon.id);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <nav aria-label="Caminho" className="text-sm font-bold text-[var(--color-muted)]">
          <Link href="/cupons" className="underline-offset-4 hover:underline">
            Cupons
          </Link>
          <span aria-hidden="true"> › </span>
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            {coupon.code}
          </h1>
          <CouponStatusBadge status={coupon.status} />
        </div>
      </header>
      <CouponForm
        action={action}
        initial={couponFormValues(coupon)}
        mode="edit"
        usedCount={coupon.usedCount}
      />
    </section>
  );
}
