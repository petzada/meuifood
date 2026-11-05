// Cardápio do D1 → contrato público (`publicMenuSchema` de @foode/shared/menu). Usado pelo
// Cardápio do Storefront, pelo recálculo do carrinho e pela cotação/criação do Pedido.
import type { PublicStoreMenu } from "@foode/db";
import { type PublicMenu, publicMenuSchema } from "@foode/shared/menu";

import { menuImageUrl } from "./media";

/**
 * Converte o Cardápio do D1 no contrato público e valida com `publicMenuSchema` (o mesmo schema
 * que o Storefront parseia). Sem `store_id`, sem chave interna de imagem: só `imageUrl`.
 */
export function toPublicMenu(menu: PublicStoreMenu, baseUrl: string | null): PublicMenu {
  return publicMenuSchema.parse({
    slug: menu.slug,
    name: menu.name,
    ...(menu.preview ? { state: "preview" } : {}),
    categories: menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        available: item.available,
        featured: item.featured,
        imageUrl: menuImageUrl(baseUrl, item.imageObjectKey),
        complementGroups: item.complementGroups,
        additionals: item.additionals,
      })),
    })),
  });
}
