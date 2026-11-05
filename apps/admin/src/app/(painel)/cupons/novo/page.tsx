import { redirect } from "next/navigation";

// Endereço antigo do "Novo Cupom": o cadastro agora é um modal sobre `/cupons` (decisão 74).
export const dynamic = "force-dynamic";

export default function NewCouponPage() {
  redirect("/cupons?novo=1");
}
