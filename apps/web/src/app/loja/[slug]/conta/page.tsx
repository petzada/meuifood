import { movedStorePath } from "@foode/shared/onboarding";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getCustomerOrders, getCustomerSession } from "../../../../lib/customer-session";
import { searchString } from "../../../../lib/slug-moved";
import { getPublicMenu } from "../../../../lib/storefront";
import { turnstileSiteKey } from "../../../../lib/turnstile";
import { AccountView } from "./account-view";

// "Minha conta" na Loja (Ticket 13): dados da conta (CPF mascarado) e os Pedidos desta Loja
// (os Guest com o telefone verificado entram no vínculo); nada de outra Loja. Sem sessão, a
// própria página oferece o login por código.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  robots: { index: false },
  title: "Minha conta | Foode Delivery",
};

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { slug } = await params;
  const menu = await getPublicMenu(slug);
  if (menu.kind === "not_found") notFound();
  if (menu.kind === "moved") {
    permanentRedirect(
      movedStorePath(`/loja/${slug}/conta${searchString(await searchParams)}`, menu.currentSlug),
    );
  }
  if (menu.kind !== "ok") throw new Error(`storefront_unavailable:${menu.reason}`);

  const session = await getCustomerSession();
  const orders = session.state === "signed_in" ? await getCustomerOrders(slug) : null;

  return (
    <AccountView
      orders={orders}
      session={session}
      siteKey={turnstileSiteKey()}
      storeName={menu.menu.name}
      storeSlug={menu.menu.slug}
    />
  );
}
