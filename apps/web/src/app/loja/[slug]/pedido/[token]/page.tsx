import { movedStorePath } from "@foode/shared/onboarding";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { searchString } from "../../../../../lib/slug-moved";
import { getStoreState, loadOrderTracking } from "../../../../../lib/storefront";
import { PixelScripts } from "../../storefront/pixel-scripts";
import { OrderTrackingView } from "./order-tracking";

// Página do Pedido por token (Ticket 24a): lida da api pelo binding `API` a cada request;
// token de outra Loja ou inexistente = 404, sem distinguir. Sem telefone no contrato.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; token: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  robots: { index: false },
  title: "Seu pedido | Foode Delivery",
};

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { slug, token } = await params;
  const result = await loadOrderTracking(slug, token);
  if (result.kind === "not_found") notFound();
  if (result.kind === "moved") {
    permanentRedirect(
      movedStorePath(
        `/loja/${slug}/pedido/${token}${searchString(await searchParams)}`,
        result.currentSlug,
      ),
    );
  }
  if (result.kind === "error") throw new Error(`order_tracking_unavailable:${result.reason}`);
  // Pixel `purchase` (Ticket 28): só com a Loja configurada; o estado falhar não derruba a página.
  const state = await getStoreState(slug);
  const pixels = state.kind === "ok" ? (state.data.showcase?.pixels ?? null) : null;

  return (
    <>
      <PixelScripts pixels={pixels} />
      <OrderTrackingView initial={result.data} pixels={pixels} storeSlug={slug} token={token} />
    </>
  );
}
