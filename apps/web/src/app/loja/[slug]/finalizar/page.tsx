import { movedStorePath } from "@foode/shared/onboarding";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { searchString } from "../../../../lib/slug-moved";
import { getPublicMenu, getStoreState } from "../../../../lib/storefront";
import { PixelScripts } from "../storefront/pixel-scripts";
import { turnstileSiteKey } from "../../../../lib/turnstile";
import { Checkout } from "./checkout";

// Checkout do Storefront (Ticket 24a). Cardápio e estado da Loja vêm da api a cada request;
// o carrinho vem do `localStorage` da Loja no navegador.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

function describe(load: { kind: string; reason?: string }): string {
  return load.reason ?? load.kind;
}
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicMenu(slug);
  if (result.kind !== "ok") return { title: "Cardápio indisponível | Foode Delivery" };
  return { robots: { index: false }, title: `Finalizar pedido · ${result.menu.name}` };
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { slug } = await params;
  const [menu, state] = await Promise.all([getPublicMenu(slug), getStoreState(slug)]);
  if (menu.kind === "not_found" || state.kind === "not_found") notFound();
  const moved = menu.kind === "moved" ? menu : state.kind === "moved" ? state : null;
  if (moved) {
    permanentRedirect(
      movedStorePath(
        `/loja/${slug}/finalizar${searchString(await searchParams)}`,
        moved.currentSlug,
      ),
    );
  }
  if (menu.kind !== "ok") throw new Error(`storefront_unavailable:${describe(menu)}`);
  if (state.kind !== "ok") throw new Error(`checkout_unavailable:${describe(state)}`);

  return (
    <>
      <PixelScripts pixels={state.data.showcase?.pixels} />
      <Checkout menu={menu.menu} siteKey={turnstileSiteKey()} state={state.data} />
    </>
  );
}
