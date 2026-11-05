// Cardápio do D1 (Ticket 23; comportamento dos Tickets 05/06 + decisão 63). Convenções em
// fundacao.ts: datas ISO-8601 UTC (`utcCheck`), dinheiro em centavos (`_cents`), ids UUID TEXT.
//
// Isolamento por Loja também no banco: toda tabela tem `store_id`, e os filhos apontam para o pai
// por FK COMPOSTA (`store_id`, `<pai>_id`) → (`store_id`, `id`). Um item não consegue pertencer a
// uma categoria de outra Loja, nem um grupo/opção/Adicional a um item de outra Loja, mesmo com
// bug na operação. O D1 aplica foreign keys sempre.
//
// Regras que ficam no servidor (não cabem num CHECK do SQLite):
// - até MAX_FEATURED_ITEMS (4) itens em destaque por Loja (P-5.5), conferido com INSERT/UPDATE
//   condicional no `batch`;
// - `min_select` ≤ número de opções do grupo (o CHECK cobre `min_select ≤ max_select`).
// Ordem de exibição em `position` (inteiro ≥ 0, sem UNIQUE: o reordenar regrava em `batch`).
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { stores, utcCheck, utcNowDefault } from "./fundacao";

/** Teto do domínio em centavos (R$ 1.000.000,00), igual a `MAX_CENTS` de @foode/shared/money. */
export const MENU_MAX_CENTS = 100_000_000;
/** Limites de texto iguais ao contrato público (`menuNameSchema`, descrição do item). */
export const MENU_NAME_MAX = 120;
export const MENU_DESCRIPTION_MAX = 600;
/** Opções por grupo e teto de `max_select` (MAX_COMPLEMENT_OPTIONS de @foode/shared/menu). */
export const MENU_MAX_OPTIONS = 40;

function nameCheck(column = "name") {
  return sql.raw(`length(trim("${column}")) BETWEEN 1 AND ${MENU_NAME_MAX}`);
}

function centsCheck(column: string) {
  return sql.raw(`"${column}" BETWEEN 0 AND ${MENU_MAX_CENTS}`);
}

function boolCheck(column: string) {
  return sql.raw(`"${column}" IN (0, 1)`);
}

function positionCheck() {
  return sql.raw(`"position" >= 0`);
}

/** Categoria do Cardápio. `available` = 0 tira a categoria inteira do Storefront (CAR-02). */
export const menuCategories = sqliteTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    // Alvo das FKs compostas dos itens.
    uniqueIndex("menu_categories_store_id_unique").on(table.storeId, table.id),
    index("menu_categories_store_position_idx").on(table.storeId, table.position),
    check("menu_categories_name", nameCheck()),
    check("menu_categories_position", positionCheck()),
    check("menu_categories_available_bool", boolCheck("available")),
    check("menu_categories_created_at_utc", utcCheck("created_at")),
    check("menu_categories_updated_at_utc", utcCheck("updated_at")),
  ],
);

/**
 * Item do Cardápio. `image_object_key` é a chave no bucket R2 `foode-media`
 * (`stores/{store_id}/menu/{uuid}.{ext}`, gerada pelo servidor); o CHECK garante o prefixo da
 * própria Loja. `featured` = Destaque (P-5.5, até 4 por Loja, conferido no servidor).
 */
export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    categoryId: text("category_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    imageObjectKey: text("image_object_key"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    // Categoria com itens não é apagada (RESTRICT): a operação devolve `conflict`.
    foreignKey({
      name: "menu_items_category_fk",
      columns: [table.storeId, table.categoryId],
      foreignColumns: [menuCategories.storeId, menuCategories.id],
    }),
    uniqueIndex("menu_items_store_id_unique").on(table.storeId, table.id),
    index("menu_items_category_position_idx").on(table.storeId, table.categoryId, table.position),
    index("menu_items_store_featured_idx").on(table.storeId, table.featured),
    check("menu_items_name", nameCheck()),
    check("menu_items_description", sql.raw(`length("description") <= ${MENU_DESCRIPTION_MAX}`)),
    check("menu_items_price_cents", centsCheck("price_cents")),
    check("menu_items_available_bool", boolCheck("available")),
    check("menu_items_featured_bool", boolCheck("featured")),
    check(
      "menu_items_image_key_store",
      sql.raw(
        `"image_object_key" IS NULL OR (length("image_object_key") <= 200 AND substr("image_object_key", 1, length('stores/' || "store_id" || '/menu/')) = 'stores/' || "store_id" || '/menu/')`,
      ),
    ),
    check("menu_items_position", positionCheck()),
    check("menu_items_created_at_utc", utcCheck("created_at")),
    check("menu_items_updated_at_utc", utcCheck("updated_at")),
  ],
);

/**
 * Grupo de Complemento de um item: o Consumidor escolhe de `min_select` a `max_select` opções
 * (`min_select` 0 = opcional). Sem grupos compartilhados entre itens (P-CAR-1: copia-se).
 */
export const menuComplementGroups = sqliteTable(
  "menu_complement_groups",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    itemId: text("item_id").notNull(),
    name: text("name").notNull(),
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "menu_complement_groups_item_fk",
      columns: [table.storeId, table.itemId],
      foreignColumns: [menuItems.storeId, menuItems.id],
    }).onDelete("cascade"),
    uniqueIndex("menu_complement_groups_store_id_unique").on(table.storeId, table.id),
    index("menu_complement_groups_item_position_idx").on(
      table.storeId,
      table.itemId,
      table.position,
    ),
    check("menu_complement_groups_name", nameCheck()),
    check(
      "menu_complement_groups_select_bounds",
      sql.raw(
        `"min_select" >= 0 AND "max_select" BETWEEN 1 AND ${MENU_MAX_OPTIONS} AND "min_select" <= "max_select"`,
      ),
    ),
    check("menu_complement_groups_position", positionCheck()),
    check("menu_complement_groups_created_at_utc", utcCheck("created_at")),
    check("menu_complement_groups_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Opção de um grupo de Complemento. `price_cents` opcional, padrão 0 (P-1.1). */
export const menuComplementOptions = sqliteTable(
  "menu_complement_options",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    groupId: text("group_id").notNull(),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "menu_complement_options_group_fk",
      columns: [table.storeId, table.groupId],
      foreignColumns: [menuComplementGroups.storeId, menuComplementGroups.id],
    }).onDelete("cascade"),
    index("menu_complement_options_group_position_idx").on(
      table.storeId,
      table.groupId,
      table.position,
    ),
    check("menu_complement_options_name", nameCheck()),
    check("menu_complement_options_price_cents", centsCheck("price_cents")),
    check("menu_complement_options_position", positionCheck()),
    check("menu_complement_options_created_at_utc", utcCheck("created_at")),
    check("menu_complement_options_updated_at_utc", utcCheck("updated_at")),
  ],
);

/** Adicional de um item: preço próprio e disponibilidade (Ticket 06, achado 20.3). */
export const menuAdditionals = sqliteTable(
  "menu_additionals",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    itemId: text("item_id").notNull(),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "menu_additionals_item_fk",
      columns: [table.storeId, table.itemId],
      foreignColumns: [menuItems.storeId, menuItems.id],
    }).onDelete("cascade"),
    index("menu_additionals_item_position_idx").on(table.storeId, table.itemId, table.position),
    check("menu_additionals_name", nameCheck()),
    check("menu_additionals_price_cents", centsCheck("price_cents")),
    check("menu_additionals_available_bool", boolCheck("available")),
    check("menu_additionals_position", positionCheck()),
    check("menu_additionals_created_at_utc", utcCheck("created_at")),
    check("menu_additionals_updated_at_utc", utcCheck("updated_at")),
  ],
);

export type MenuCategoryRow = typeof menuCategories.$inferSelect;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type MenuComplementGroupRow = typeof menuComplementGroups.$inferSelect;
export type MenuComplementOptionRow = typeof menuComplementOptions.$inferSelect;
export type MenuAdditionalRow = typeof menuAdditionals.$inferSelect;
