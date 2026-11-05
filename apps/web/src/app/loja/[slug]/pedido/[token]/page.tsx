import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadOrderTracking } from "../../../../../lib/storefront";
import { OrderTrackingView } from "./order-tracking";

// Página do Pedido por token (Ticket 24a): lida da api pelo binding `API` a cada request;
// token de outra Loja ou inexistente = 404, sem distinguir. Sem telefone no contrato.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; token: string }>;

export const metadata: Metadata = {
  robots: { index: false },
  title: "Seu pedido | Foode Delivery",
};

export default async function OrderTrackingPage({ params }: { params: Params }) {
  const { slug, token } = await params;
  const result = await loadOrderTracking(slug, token);
  if (result.kind === "not_found") notFound();
  if (result.kind === "error") throw new Error(`order_tracking_unavailable:${result.reason}`);

  return <OrderTrackingView initial={result.data} storeSlug={slug} token={token} />;
}
