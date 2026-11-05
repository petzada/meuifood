import { Button, OutlineContainer } from "@foode/ui";
import Link from "next/link";

import { Notice } from "../../../components/form";
import { painelRead } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { SectionHeading } from "../ops/_components/fields";
import { CouponTable } from "./_components/coupon-table";
import { WelcomeCouponForm } from "./_components/welcome-form";
import { deleteCoupon, saveWelcomeCoupon, setCouponActive } from "./actions";

// `/cupons` (Ticket 13, NAV-01: só o Dono, `store.settings`): Cupom de boas-vindas no topo
// (CUP-04) e a lista de Cupons promocionais (CUP-01). Operador e Ops não chegam aqui.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CouponsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("store.settings");
  const overview = await painelRead("os Cupons", (api, caller) => api.couponsGet(caller));
  const created = (await searchParams)?.criado === "1";
  const active = overview.coupons.filter((coupon) => coupon.status === "active").length;

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--color-muted)]">Loja</p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Cupons
          </h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
            O Consumidor aplica o código no checkout; o desconto é calculado no servidor sobre os
            itens e nunca sobre a taxa de entrega. Um Cupom por Pedido.
          </p>
        </div>
        <Button asChild>
          <Link href="/cupons/novo">Criar Cupom</Link>
        </Button>
      </header>

      {created ? <Notice tone="success">Cupom criado.</Notice> : null}

      <WelcomeCouponForm action={saveWelcomeCoupon} initial={overview.welcome} />

      <OutlineContainer as="section" aria-labelledby="cupons-lista" className="overflow-hidden">
        <div className="p-5 md:px-7 md:pt-7">
          <SectionHeading
            id="cupons-lista"
            description={
              overview.coupons.length === 0
                ? undefined
                : `${overview.coupons.length} Cupo${overview.coupons.length === 1 ? "m" : "ns"} · ${active} ativo${active === 1 ? "" : "s"}. Um Cupom usado não pode ser excluído: desative.`
            }
          >
            Cupons promocionais
          </SectionHeading>
        </div>
        <CouponTable
          coupons={overview.coupons}
          onDelete={deleteCoupon}
          onSetActive={setCouponActive}
        />
      </OutlineContainer>
    </section>
  );
}
