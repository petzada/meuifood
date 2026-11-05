import { movedStorePath } from "@foode/shared/onboarding";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { getCustomerSession } from "../../../lib/customer-session";
import { searchString } from "../../../lib/slug-moved";
import { getPublicMenu, getStoreState } from "../../../lib/storefront";
import { turnstileSiteKey } from "../../../lib/turnstile";
import { PixelScripts } from "./storefront/pixel-scripts";
import { Storefront } from "./storefront/storefront";

// O Cardápio e o estado da Loja vêm da api a cada request (binding `API`); nada é
// pré-renderizado. Estado indisponível não derruba o Cardápio: a api recusa o Pedido fora do
// horário na própria escrita.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [result, state] = await Promise.all([getPublicMenu(slug), getStoreState(slug)]);
  if (result.kind !== "ok") return { title: "Cardápio indisponível | Foode Delivery" };
  // Meta description = descrição curta da Loja (P-VIS-3); sem ela, a frase padrão.
  const description =
    (state.kind === "ok" ? state.data.showcase?.description : null) ??
    `Veja o Cardápio de ${result.menu.name} e faça seu pedido pelo celular.`;
  return { description, title: `${result.menu.name} | Cardápio` };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { slug } = await params;
  const [result, state] = await Promise.all([getPublicMenu(slug), getStoreState(slug)]);
  if (result.kind === "not_found") notFound();
  // Link personalizado antigo (decisão 69): 308 para o atual, com a query preservada.
  if (result.kind === "moved") {
    permanentRedirect(
      movedStorePath(`/loja/${slug}${searchString(await searchParams)}`, result.currentSlug),
    );
  }
  if (result.kind === "error") throw new Error(`storefront_unavailable:${result.reason}`);
  const storeState = state.kind === "ok" ? state.data : null;
  // Conta do Consumidor (Ticket 13): "Entrar" no cabeçalho; falha = anônimo, Cardápio segue.
  const session = await getCustomerSession();

  return (
    <Suspense fallback={null}>
      <PixelScripts pixels={storeState?.showcase?.pixels} />
      <Storefront
        branding={{
          coverUrl: storeState?.showcase?.coverUrl ?? null,
          logoUrl: storeState?.showcase?.logoUrl ?? null,
        }}
        menu={result.menu}
        session={session}
        siteKey={turnstileSiteKey()}
        state={storeState}
      />
    </Suspense>
  );
}
