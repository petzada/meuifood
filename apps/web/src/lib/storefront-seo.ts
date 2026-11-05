// SEO do Storefront (Ticket 31, decisão 70): OG com logo/capa e descrição curta da Loja;
// indexável só quando a Loja tem descrição e logo (sem isso, `noindex`). Opt-out por Loja
// (`seo_index`) fica para quando o contrato da vitrine tiver o campo (TODO(31-seo-optout)).
import type { Metadata } from "next";

export type StorefrontShowcaseForSeo = {
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
};

export const STOREFRONT_INDEX_MIN_DESCRIPTION = 60;

export function isStorefrontIndexable(showcase: StorefrontShowcaseForSeo | undefined): boolean {
  if (!showcase) return false;
  const description = showcase.description?.trim() ?? "";
  return description.length >= STOREFRONT_INDEX_MIN_DESCRIPTION && Boolean(showcase.logoUrl);
}

export function storefrontMetadata(
  slug: string,
  storeName: string,
  showcase: StorefrontShowcaseForSeo | undefined,
): Metadata {
  const path = `/loja/${slug}`;
  // Meta description = descrição curta da Loja (P-VIS-3); sem ela, a frase padrão.
  const description =
    showcase?.description?.trim() ||
    `Veja o cardápio de ${storeName} e faça seu pedido pelo celular.`;
  const image = showcase?.coverUrl ?? showcase?.logoUrl ?? null;
  const title = `${storeName} | Cardápio`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: isStorefrontIndexable(showcase)
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "website",
      url: path,
      title,
      description,
      siteName: "Foode Delivery",
      locale: "pt_BR",
      ...(image ? { images: [{ url: image, alt: storeName }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
  };
}
