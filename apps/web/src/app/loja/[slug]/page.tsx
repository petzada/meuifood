import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getPublicMenu, getStoreState } from "../../../lib/storefront";
import { Storefront } from "./storefront/storefront";

// O Cardápio e o estado da Loja vêm da api a cada request (binding `API`); nada é
// pré-renderizado. Estado indisponível não derruba o Cardápio: a api recusa o Pedido fora do
// horário na própria escrita.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicMenu(slug);
  if (result.kind !== "ok") return { title: "Cardápio indisponível | Foode Delivery" };
  return {
    description: `Veja o Cardápio de ${result.menu.name} e faça seu pedido pelo celular.`,
    title: `${result.menu.name} | Cardápio`,
  };
}

export default async function StorefrontPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [result, state] = await Promise.all([getPublicMenu(slug), getStoreState(slug)]);
  if (result.kind === "not_found") notFound();
  if (result.kind === "error") throw new Error(`storefront_unavailable:${result.reason}`);

  return (
    <Suspense fallback={null}>
      <Storefront menu={result.menu} state={state.kind === "ok" ? state.data : null} />
    </Suspense>
  );
}
