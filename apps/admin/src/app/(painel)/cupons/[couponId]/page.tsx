import { redirect } from "next/navigation";

// Endereço antigo da edição do Cupom: agora é um modal com abas sobre `/cupons` (decisão 74).
export const dynamic = "force-dynamic";

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ couponId: string }>;
}) {
  const { couponId } = await params;
  redirect(`/cupons?cupom=${encodeURIComponent(couponId)}`);
}
