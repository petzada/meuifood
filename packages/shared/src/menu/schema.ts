// Contrato público do Cardápio (Ticket 23; achados 20.1 e 20.3). É o único shape que
// `api` emite e `web`/`admin` parseiam. Preço sempre em centavos inteiros (`money.ts`).
// Complementos saem do `required` booleano do legado para `minSelect`/`maxSelect`;
// `required: true` do legado equivale a `{ minSelect: 1, maxSelect: 1 }`.
import { z } from "zod";

import { centsSchema } from "../money.js";

export const menuIdSchema = z.string().uuid();

export const menuNameSchema = z.string().trim().min(1).max(120);

/** Limites de opções/adicionais por grupo e por item, iguais aos da `api` legada. */
export const MAX_COMPLEMENT_OPTIONS = 40;
export const MAX_ADDITIONALS_PER_ITEM = 40;

/** Destaques do topo do Storefront: até 4 itens por Loja (decisão 63, P-5.5). */
export const MAX_FEATURED_ITEMS = 4;

/** Descrição do item no Cardápio (mesmo teto do CHECK no D1). */
export const menuDescriptionSchema = z.string().trim().max(600);

/**
 * Opção de Complemento. `priceCents` é opcional na escrita e vale 0 por padrão (decisão 63,
 * P-1.1): "Borda Catupiry +R$ 9,90" soma ao preço da linha; opção sem preço não muda nada.
 */
export const complementOptionSchema = z.object({
  id: menuIdSchema,
  name: menuNameSchema,
  priceCents: centsSchema.default(0),
});

export const complementGroupSchema = z
  .object({
    id: menuIdSchema,
    name: menuNameSchema,
    /** Quantas opções o Consumidor precisa escolher no mínimo (0 = opcional). */
    minSelect: z.number().int().min(0).max(MAX_COMPLEMENT_OPTIONS),
    /** Quantas opções pode escolher no máximo (>= 1). */
    maxSelect: z.number().int().min(1).max(MAX_COMPLEMENT_OPTIONS),
    options: z.array(complementOptionSchema).min(1).max(MAX_COMPLEMENT_OPTIONS),
  })
  .superRefine((group, ctx) => {
    if (group.minSelect > group.maxSelect) {
      ctx.addIssue({
        code: "custom",
        message: "minSelect não pode ser maior que maxSelect",
        path: ["minSelect"],
      });
    }
    if (group.minSelect > group.options.length) {
      ctx.addIssue({
        code: "custom",
        message: "minSelect não pode exceder o número de opções",
        path: ["minSelect"],
      });
    }
    if (new Set(group.options.map((option) => option.id)).size !== group.options.length) {
      ctx.addIssue({ code: "custom", message: "opção duplicada no grupo", path: ["options"] });
    }
  });

/** Adicional mantém `available` no contrato público (20.3): a mesma regra vale nos dois lados. */
export const additionalSchema = z.object({
  available: z.boolean(),
  id: menuIdSchema,
  name: menuNameSchema,
  priceCents: centsSchema,
});

export const menuItemSchema = z
  .object({
    additionals: z.array(additionalSchema).max(MAX_ADDITIONALS_PER_ITEM),
    available: z.boolean(),
    complementGroups: z.array(complementGroupSchema),
    description: menuDescriptionSchema,
    /** Destaque (P-5.5): aparece no carrossel do topo; no máximo MAX_FEATURED_ITEMS por Loja. */
    featured: z.boolean(),
    id: menuIdSchema,
    imageUrl: z.string().url().nullable(),
    name: menuNameSchema,
    priceCents: centsSchema,
  })
  .superRefine((item, ctx) => {
    if (
      new Set(item.complementGroups.map((group) => group.id)).size !== item.complementGroups.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "grupo duplicado no item",
        path: ["complementGroups"],
      });
    }
    if (
      new Set(item.additionals.map((additional) => additional.id)).size !== item.additionals.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "adicional duplicado no item",
        path: ["additionals"],
      });
    }
  });

/** Categoria pública: a `api` só emite categorias disponíveis, na ordem do Dono (`position`). */
export const menuCategorySchema = z.object({
  id: menuIdSchema,
  items: z.array(menuItemSchema),
  name: menuNameSchema,
});

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u, "slug inválido");

/**
 * Cardápio público de uma Loja, resolvido pelo Slug (nunca por `store_id` do navegador).
 * Operação (aberto/fechado) e Delivery têm contratos próprios nos Tickets 24/26.
 */
export const publicMenuSchema = z
  .object({
    categories: z.array(menuCategorySchema),
    name: menuNameSchema,
    slug: storeSlugSchema,
  })
  .superRefine((menu, ctx) => {
    const featured = menu.categories.flatMap((category) =>
      category.items.filter((item) => item.featured),
    );
    if (featured.length > MAX_FEATURED_ITEMS) {
      ctx.addIssue({
        code: "custom",
        message: `no máximo ${MAX_FEATURED_ITEMS} itens em destaque`,
        path: ["categories"],
      });
    }
  });

export type ComplementOption = z.infer<typeof complementOptionSchema>;
export type ComplementGroup = z.infer<typeof complementGroupSchema>;
export type Additional = z.infer<typeof additionalSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;

/** Índice por id para o carrinho e o recálculo, sem varrer categorias a cada linha. */
export function indexMenuItems(menu: Pick<PublicMenu, "categories">): Map<string, MenuItem> {
  const byId = new Map<string, MenuItem>();
  for (const category of menu.categories) {
    for (const item of category.items) byId.set(item.id, item);
  }
  return byId;
}

/** Converte o `required` do legado para os limites novos. */
export function selectionBoundsFromRequired(
  required: boolean,
): Pick<ComplementGroup, "minSelect" | "maxSelect"> {
  return required ? { maxSelect: 1, minSelect: 1 } : { maxSelect: 1, minSelect: 0 };
}
