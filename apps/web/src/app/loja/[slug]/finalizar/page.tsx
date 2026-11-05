import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicMenu, getStoreState } from "../../../../lib/storefront";
import { turnstileSiteKey } from "../../../../lib/turnstile";
import { Checkout } from "./checkout";

// Checkout do Storefront (Ticket 24a). Cardápio e estado da Loja vêm da api a cada request;
// o carrinho vem do `localStorage` da Loja no navegador.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicMenu(slug);
  if (result.kind !== "ok") return { title: "Cardápio indisponível | Foode Delivery" };
  return { robots: { index: false }, title: `Finalizar pedido · ${result.menu.name}` };
}

export default async function CheckoutPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [menu, state] = await Promise.all([getPublicMenu(slug), getStoreState(slug)]);
  if (menu.kind === "not_found" || state.kind === "not_found") notFound();
  if (menu.kind === "error") throw new Error(`storefront_unavailable:${menu.reason}`);
  if (state.kind === "error") throw new Error(`checkout_unavailable:${state.reason}`);

  return <Checkout menu={menu.menu} siteKey={turnstileSiteKey()} state={state.data} />;
}
