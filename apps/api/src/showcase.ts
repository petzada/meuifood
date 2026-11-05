// Vitrine do D1 → contrato público (`storefrontShowcaseSchema` de @foode/shared/onboarding),
// usada no `GET /storefront/lojas/:slug/estado` (Ticket 28). Sem chave interna do R2: só URLs.
import type { PublicShowcaseRow } from "@foode/db";
import {
  EMPTY_STOREFRONT_SHOWCASE,
  type StorefrontShowcase,
  storefrontShowcaseSchema,
} from "@foode/shared/onboarding";

import { menuImageUrl } from "./media";

export function toStorefrontShowcase(
  row: PublicShowcaseRow | null,
  baseUrl: string | null,
): StorefrontShowcase {
  if (!row) return EMPTY_STOREFRONT_SHOWCASE;
  return storefrontShowcaseSchema.parse({
    description: row.description,
    logoUrl: menuImageUrl(baseUrl, row.logoObjectKey),
    coverUrl: menuImageUrl(baseUrl, row.coverObjectKey),
    instagram: row.instagram,
    pixels: { metaPixelId: row.metaPixelId, googleTagId: row.googleTagId },
  });
}
