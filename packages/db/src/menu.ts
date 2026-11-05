// Cardápio no D1 (Ticket 23; comportamento dos Tickets 05/06 + decisão 63). Só este pacote fala
// SQL: o Painel chega aqui por `db.store(ctx).menu` (StoreContext de Dono) e o Storefront por
// `db.storefront.publicMenuBySlug` (só Loja `active`).
//
// Regras:
// - Toda escrita filtra por `ctx.storeId`; id de outra Loja é indistinguível de inexistente
//   (`not_found`). Filhos ainda têm FK composta (store_id, pai) no schema.
// - Escrita + auditoria no mesmo `batch` atômico; a auditoria é um INSERT…SELECT da própria linha
//   escrita (só grava se a escrita aconteceu).
// - Teto de 4 Destaques (P-5.5) e de Adicionais por item: condição no próprio INSERT/UPDATE
//   (o D1 serializa as escritas, então a contagem não corre).
// - `min_select` ≤ número de opções: depois de gravar grupo e opções, um UPDATE de guarda leva
//   `min_select` a -1 se a regra quebrou; o CHECK do schema recusa e o `batch` inteiro volta.
// - Sem transação interativa: pré-leituras só decidem o código de erro ou montam o batch; a
//   integridade fica nas condições do SQL.
// - D1 aceita no máximo 100 parâmetros por consulta: listas de ids vão como JSON (`json_each`).
import { assertIssued, type StoreContext } from "./context";
import { newId, utcNow } from "./conventions";
import { MENU_MAX_OPTIONS } from "./schema";

/** Destaques por Loja (P-5.5), igual a MAX_FEATURED_ITEMS de @foode/shared/menu. */
export const MENU_MAX_FEATURED = 4;
/** Adicionais por item, igual a MAX_ADDITIONALS_PER_ITEM de @foode/shared/menu. */
export const MENU_MAX_ADDITIONALS = 40;

export type MenuError = "not_found" | "conflict" | "invalid_input";
export type MenuResult<T> = { ok: true; data: T } | { ok: false; error: MenuError };

export type StoreMenuOption = { id: string; name: string; priceCents: number };
export type StoreMenuGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: StoreMenuOption[];
};
export type StoreMenuAdditional = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
};
export type StoreMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  featured: boolean;
  imageObjectKey: string | null;
  complementGroups: StoreMenuGroup[];
  additionals: StoreMenuAdditional[];
};
export type StoreMenuCategory = {
  id: string;
  name: string;
  available: boolean;
  items: StoreMenuItem[];
};
export type StoreMenu = { categories: StoreMenuCategory[] };

/** Cardápio público: só categorias disponíveis e com itens; itens indisponíveis vêm marcados. */
export type PublicStoreMenu = {
  slug: string;
  name: string;
  categories: Array<{ id: string; name: string; items: StoreMenuItem[] }>;
};

export type MenuCategoryInput = { name: string; available: boolean };
export type MenuCategoryUpdate = {
  categoryId: string;
  name?: string | undefined;
  available?: boolean | undefined;
};
export type MenuItemInput = {
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  featured: boolean;
  imageObjectKey: string | null;
};
export type MenuItemUpdate = {
  itemId: string;
  categoryId?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  priceCents?: number | undefined;
  available?: boolean | undefined;
  featured?: boolean | undefined;
  /** `null` remove a foto; ausente não mexe. */
  imageObjectKey?: string | null | undefined;
};
export type MenuGroupInput = {
  itemId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Array<{ name: string; priceCents: number }>;
};
export type MenuGroupUpdate = {
  groupId: string;
  name?: string | undefined;
  minSelect?: number | undefined;
  maxSelect?: number | undefined;
  /** Lista completa na nova ordem: com `id` atualiza, sem `id` cria, ausente apaga. */
  options?: Array<{ id?: string | undefined; name: string; priceCents: number }> | undefined;
};
export type MenuAdditionalInput = {
  itemId: string;
  name: string;
  priceCents: number;
  available: boolean;
};
export type MenuAdditionalUpdate = {
  additionalId: string;
  name?: string | undefined;
  priceCents?: number | undefined;
  available?: boolean | undefined;
};

type CategoryRow = { id: string; name: string; available: number };
type ItemRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  available: number;
  featured: number;
  imageObjectKey: string | null;
};
type GroupRow = { id: string; itemId: string; name: string; minSelect: number; maxSelect: number };
type OptionRow = { id: string; groupId: string; name: string; priceCents: number };
type AdditionalRow = {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
  available: number;
};

const ok = <T>(data: T): MenuResult<T> => ({ ok: true, data });
const fail = <T>(error: MenuError): MenuResult<T> => ({ ok: false, error });

/** Booleano para o D1 (coluna INTEGER 0/1); `undefined` vira NULL (= não mexe no COALESCE). */
function flag(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

function isCheckViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return message.includes("CHECK constraint failed");
}

/** Campos enviados num update (para a auditoria, sem valores). */
function sentFields(input: object, idKey: string): string[] {
  return Object.entries(input)
    .filter(([key, value]) => key !== idKey && value !== undefined)
    .map(([key]) => key);
}

function changed(result: D1Result | undefined): boolean {
  return (result?.meta.changes ?? 0) > 0;
}

const SELECT_CATEGORIES = `SELECT id, name, available FROM menu_categories WHERE store_id = ?
  ORDER BY position, created_at, id`;
const SELECT_ITEMS = `SELECT id, category_id AS categoryId, name, description,
  price_cents AS priceCents, available, featured, image_object_key AS imageObjectKey
  FROM menu_items WHERE store_id = ? ORDER BY position, created_at, id`;
const SELECT_GROUPS = `SELECT id, item_id AS itemId, name, min_select AS minSelect,
  max_select AS maxSelect FROM menu_complement_groups WHERE store_id = ?
  ORDER BY position, created_at, id`;
const SELECT_OPTIONS = `SELECT id, group_id AS groupId, name, price_cents AS priceCents
  FROM menu_complement_options WHERE store_id = ? ORDER BY position, created_at, id`;
const SELECT_ADDITIONALS = `SELECT id, item_id AS itemId, name, price_cents AS priceCents,
  available FROM menu_additionals WHERE store_id = ? ORDER BY position, created_at, id`;

/** Lê o Cardápio inteiro de uma Loja num `batch` (um snapshot só) e monta a árvore. */
async function readMenu(d1: D1Database, storeId: string): Promise<StoreMenu> {
  const [categories, items, groups, options, additionals] = await d1.batch([
    d1.prepare(SELECT_CATEGORIES).bind(storeId),
    d1.prepare(SELECT_ITEMS).bind(storeId),
    d1.prepare(SELECT_GROUPS).bind(storeId),
    d1.prepare(SELECT_OPTIONS).bind(storeId),
    d1.prepare(SELECT_ADDITIONALS).bind(storeId),
  ]);
  return buildMenu(
    (categories?.results ?? []) as CategoryRow[],
    (items?.results ?? []) as ItemRow[],
    (groups?.results ?? []) as GroupRow[],
    (options?.results ?? []) as OptionRow[],
    (additionals?.results ?? []) as AdditionalRow[],
  );
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

function buildMenu(
  categories: CategoryRow[],
  items: ItemRow[],
  groups: GroupRow[],
  options: OptionRow[],
  additionals: AdditionalRow[],
): StoreMenu {
  const optionsByGroup = groupBy(options, (row) => row.groupId);
  const groupsByItem = groupBy(groups, (row) => row.itemId);
  const additionalsByItem = groupBy(additionals, (row) => row.itemId);
  const itemsByCategory = groupBy(items, (row) => row.categoryId);

  const toItem = (row: ItemRow): StoreMenuItem => ({
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    available: row.available === 1,
    featured: row.featured === 1,
    imageObjectKey: row.imageObjectKey,
    complementGroups: (groupsByItem.get(row.id) ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: (optionsByGroup.get(group.id) ?? []).map((option) => ({
        id: option.id,
        name: option.name,
        priceCents: option.priceCents,
      })),
    })),
    additionals: (additionalsByItem.get(row.id) ?? []).map((additional) => ({
      id: additional.id,
      name: additional.name,
      priceCents: additional.priceCents,
      available: additional.available === 1,
    })),
  });

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      available: category.available === 1,
      items: (itemsByCategory.get(category.id) ?? []).map(toItem),
    })),
  };
}

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cardápio público pelo Slug: só Loja `active`; null para Slug inexistente ou Loja não ativa. */
export async function publicMenuBySlug(
  d1: D1Database,
  slug: string,
): Promise<PublicStoreMenu | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const store = await d1
    .prepare("SELECT id, slug, name FROM stores WHERE slug = ? AND status = 'active' LIMIT 1")
    .bind(slug)
    .first<{ id: string; slug: string; name: string }>();
  if (!store) return null;
  const menu = await readMenu(d1, store.id);
  return {
    slug: store.slug,
    name: store.name,
    categories: menu.categories
      .filter((category) => category.available && category.items.length > 0)
      .map((category) => ({ id: category.id, name: category.name, items: category.items })),
  };
}

/** Operações do Cardápio da Loja do contexto. Só o Dono escreve (defesa em profundidade). */
export function createMenuOps(d1: D1Database, context: StoreContext) {
  assertIssued(context);
  const storeId = context.storeId;
  const actor = context.userId;

  function requireOwner(): void {
    if (context.role !== "owner") throw new Error("forbidden: Cardápio é só do Dono");
  }

  /** Auditoria que só grava se a linha `table.id` existir nesta Loja com `updated_at = now`. */
  function auditRow(
    table: string,
    targetId: string,
    action: string,
    now: string,
    metadata: Record<string, unknown> = {},
  ): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         SELECT ?, ?, ?, store_id, ?, ?, id, ? FROM ${table}
         WHERE id = ? AND store_id = ? AND updated_at = ?`,
      )
      .bind(newId(), now, actor, action, table, JSON.stringify(metadata), targetId, storeId, now);
  }

  /** Auditoria incondicional (o batch inteiro já depende das condições anteriores). */
  function audit(
    targetType: string,
    targetId: string,
    action: string,
    now: string,
    metadata: Record<string, unknown> = {},
  ): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId(), now, actor, storeId, action, targetType, targetId, JSON.stringify(metadata));
  }

  /** Auditoria de remoção: grava antes do DELETE, com a mesma condição. */
  function auditBeforeDelete(
    table: string,
    targetId: string,
    action: string,
    now: string,
    extraWhere = "",
    extraBinds: unknown[] = [],
  ): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         SELECT ?, ?, ?, store_id, ?, ?, id, '{}' FROM ${table}
         WHERE id = ? AND store_id = ? ${extraWhere}`,
      )
      .bind(newId(), now, actor, action, table, targetId, storeId, ...extraBinds);
  }

  async function exists(table: string, id: string, extraWhere = "", ...binds: unknown[]) {
    const row = await d1
      .prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND store_id = ? ${extraWhere} LIMIT 1`)
      .bind(id, storeId, ...binds)
      .first<{ ok: number }>();
    return row?.ok === 1;
  }

  async function idsOf(table: string, parentColumn: string | null, parentId: string | null) {
    const where = parentColumn ? `AND ${parentColumn} = ?` : "";
    const binds = parentColumn ? [storeId, parentId] : [storeId];
    const rows = await d1
      .prepare(`SELECT id FROM ${table} WHERE store_id = ? ${where}`)
      .bind(...binds)
      .all<{ id: string }>();
    return new Set(rows.results.map((row) => row.id));
  }

  /**
   * Reordenação: exige exatamente o conjunto de irmãos gravado (senão `conflict`) e regrava
   * `position` num batch atômico, com auditoria.
   */
  async function reorder(
    table: string,
    parentColumn: string | null,
    parentId: string | null,
    orderedIds: string[],
    action: string,
  ): Promise<MenuResult<null>> {
    requireOwner();
    if (parentColumn && parentId) {
      const parentTable = parentColumn === "category_id" ? "menu_categories" : "menu_items";
      if (!(await exists(parentTable, parentId))) return fail("not_found");
    }
    const current = await idsOf(table, parentColumn, parentId);
    if (current.size !== orderedIds.length || orderedIds.some((id) => !current.has(id))) {
      return fail("conflict");
    }
    const now = utcNow();
    const parentWhere = parentColumn ? `AND ${parentColumn} = ?` : "";
    const statements = orderedIds.map((id, position) =>
      d1
        .prepare(
          `UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ? AND store_id = ? ${parentWhere}`,
        )
        .bind(position, now, id, storeId, ...(parentColumn ? [parentId] : [])),
    );
    statements.push(audit(table, parentId ?? storeId, action, now, { count: orderedIds.length }));
    await d1.batch(statements);
    return ok(null);
  }

  /** Próxima posição entre os irmãos (fim da lista). */
  const nextPosition = (table: string, parentColumn?: string) =>
    `COALESCE((SELECT MAX(position) + 1 FROM ${table} WHERE store_id = ?${
      parentColumn ? ` AND ${parentColumn} = ?` : ""
    }), 0)`;

  /** UPDATE de guarda: quebra o CHECK (min_select ≥ 0) se min_select > número de opções. */
  function minSelectGuard(groupId: string): D1PreparedStatement {
    return d1
      .prepare(
        `UPDATE menu_complement_groups SET min_select = -1
         WHERE id = ? AND store_id = ? AND min_select >
           (SELECT COUNT(*) FROM menu_complement_options WHERE store_id = ? AND group_id = ?)`,
      )
      .bind(groupId, storeId, storeId, groupId);
  }

  function insertOption(
    groupId: string,
    option: { name: string; priceCents: number },
    position: number,
    now: string,
  ): D1PreparedStatement {
    // INSERT…SELECT do grupo: só grava se o grupo existe nesta Loja.
    return d1
      .prepare(
        `INSERT INTO menu_complement_options (id, store_id, group_id, name, price_cents, position, created_at, updated_at)
         SELECT ?, store_id, id, ?, ?, ?, ?, ? FROM menu_complement_groups WHERE id = ? AND store_id = ?`,
      )
      .bind(newId(), option.name, option.priceCents, position, now, now, groupId, storeId);
  }

  /** Executa o batch; CHECK violado (ex.: guarda de min_select) vira `invalid_input`. */
  async function runChecked(statements: D1PreparedStatement[]): Promise<MenuResult<D1Result[]>> {
    try {
      return ok(await d1.batch(statements));
    } catch (error) {
      if (isCheckViolation(error)) return fail("invalid_input");
      throw error;
    }
  }

  return {
    /** Cardápio completo (inclui indisponíveis), na ordem do Dono. */
    async get(): Promise<StoreMenu> {
      requireOwner();
      return readMenu(d1, storeId);
    },

    /** Outro item desta Loja ainda usa a chave? (não apagar objeto compartilhado no R2) */
    async imageKeyInUse(objectKey: string): Promise<boolean> {
      const row = await d1
        .prepare(
          "SELECT 1 AS ok FROM menu_items WHERE store_id = ? AND image_object_key = ? LIMIT 1",
        )
        .bind(storeId, objectKey)
        .first<{ ok: number }>();
      return row?.ok === 1;
    },

    /** Registra evento do Cardápio sem escrita (ex.: upload de imagem no R2). */
    async recordAudit(action: string, targetId: string, metadata: Record<string, unknown> = {}) {
      requireOwner();
      await audit("menu_image", targetId, action, utcNow(), metadata).run();
    },

    // ---- Categorias ---------------------------------------------------------------------

    async createCategory(input: MenuCategoryInput): Promise<MenuResult<{ categoryId: string }>> {
      requireOwner();
      const id = newId();
      const now = utcNow();
      await d1.batch([
        d1
          .prepare(
            `INSERT INTO menu_categories (id, store_id, name, position, available, created_at, updated_at)
             VALUES (?, ?, ?, ${nextPosition("menu_categories")}, ?, ?, ?)`,
          )
          .bind(id, storeId, input.name, storeId, flag(input.available), now, now),
        auditRow("menu_categories", id, "menu.category_created", now),
      ]);
      return ok({ categoryId: id });
    },

    async updateCategory(input: MenuCategoryUpdate): Promise<MenuResult<null>> {
      requireOwner();
      const now = utcNow();
      const [update] = await d1.batch([
        d1
          .prepare(
            `UPDATE menu_categories SET name = COALESCE(?, name), available = COALESCE(?, available),
               updated_at = ? WHERE id = ? AND store_id = ?`,
          )
          .bind(orNull(input.name), flag(input.available), now, input.categoryId, storeId),
        auditRow("menu_categories", input.categoryId, "menu.category_updated", now, {
          fields: sentFields(input, "categoryId"),
        }),
      ]);
      return changed(update) ? ok(null) : fail("not_found");
    },

    /** Categoria com itens não é apagada (`conflict`, comportamento do Ticket 05). */
    async deleteCategory(categoryId: string): Promise<MenuResult<null>> {
      requireOwner();
      const noItems = `AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.store_id = ? AND i.category_id = ?)`;
      const [, removal] = await d1.batch([
        auditBeforeDelete(
          "menu_categories",
          categoryId,
          "menu.category_deleted",
          utcNow(),
          noItems,
          [storeId, categoryId],
        ),
        d1
          .prepare(`DELETE FROM menu_categories WHERE id = ? AND store_id = ? ${noItems}`)
          .bind(categoryId, storeId, storeId, categoryId),
      ]);
      if (changed(removal)) return ok(null);
      return (await exists("menu_categories", categoryId)) ? fail("conflict") : fail("not_found");
    },

    reorderCategories: (orderedIds: string[]) =>
      reorder("menu_categories", null, null, orderedIds, "menu.categories_reordered"),

    // ---- Itens --------------------------------------------------------------------------

    /** Categoria de outra Loja/inexistente = `not_found`; 5º Destaque = `conflict`. */
    async createItem(input: MenuItemInput): Promise<MenuResult<{ itemId: string }>> {
      requireOwner();
      const id = newId();
      const now = utcNow();
      const featured = flag(input.featured) ?? 0;
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO menu_items (id, store_id, category_id, name, description, price_cents, available,
               featured, image_object_key, position, created_at, updated_at)
             SELECT ?, c.store_id, c.id, ?, ?, ?, ?, ?, ?, ${nextPosition("menu_items", "category_id")}, ?, ?
             FROM menu_categories c
             WHERE c.id = ? AND c.store_id = ?
               AND (? = 0 OR (SELECT COUNT(*) FROM menu_items WHERE store_id = ? AND featured = 1) < ?)`,
          )
          .bind(
            id,
            input.name,
            input.description,
            input.priceCents,
            flag(input.available),
            featured,
            input.imageObjectKey,
            storeId,
            input.categoryId,
            now,
            now,
            input.categoryId,
            storeId,
            featured,
            storeId,
            MENU_MAX_FEATURED,
          ),
        auditRow("menu_items", id, "menu.item_created", now, { featured: featured === 1 }),
      ]);
      if (changed(insert)) return ok({ itemId: id });
      return (await exists("menu_categories", input.categoryId))
        ? fail("conflict")
        : fail("not_found");
    },

    /**
     * Edita só os campos enviados. Mover de categoria leva o item ao fim da outra; virar Destaque
     * além do teto = `conflict`. Devolve a chave de imagem anterior quando ela mudou (para apagar
     * o objeto no R2 depois).
     */
    async updateItem(
      input: MenuItemUpdate,
    ): Promise<MenuResult<{ previousImageObjectKey: string | null }>> {
      requireOwner();
      const before = await d1
        .prepare(
          "SELECT image_object_key AS imageObjectKey FROM menu_items WHERE id = ? AND store_id = ?",
        )
        .bind(input.itemId, storeId)
        .first<{ imageObjectKey: string | null }>();
      if (!before) return fail("not_found");

      const now = utcNow();
      const category = orNull(input.categoryId);
      const featured = flag(input.featured);
      const setImage = input.imageObjectKey !== undefined ? 1 : 0;
      const [update] = await d1.batch([
        d1
          .prepare(
            `UPDATE menu_items SET
               position = CASE WHEN ?1 IS NOT NULL AND ?1 <> category_id
                 THEN COALESCE((SELECT MAX(position) + 1 FROM menu_items WHERE store_id = ?2 AND category_id = ?1), 0)
                 ELSE position END,
               category_id = COALESCE(?1, category_id),
               name = COALESCE(?3, name),
               description = COALESCE(?4, description),
               price_cents = COALESCE(?5, price_cents),
               available = COALESCE(?6, available),
               featured = COALESCE(?7, featured),
               image_object_key = CASE WHEN ?8 = 1 THEN ?9 ELSE image_object_key END,
               updated_at = ?10
             WHERE id = ?11 AND store_id = ?2
               AND (?1 IS NULL OR EXISTS (SELECT 1 FROM menu_categories WHERE id = ?1 AND store_id = ?2))
               AND (?7 IS NOT 1 OR featured = 1
                 OR (SELECT COUNT(*) FROM menu_items WHERE store_id = ?2 AND featured = 1) < ?12)`,
          )
          .bind(
            category,
            storeId,
            orNull(input.name),
            orNull(input.description),
            orNull(input.priceCents),
            flag(input.available),
            featured,
            setImage,
            input.imageObjectKey ?? null,
            now,
            input.itemId,
            MENU_MAX_FEATURED,
          ),
        auditRow("menu_items", input.itemId, "menu.item_updated", now, {
          fields: sentFields(input, "itemId"),
        }),
      ]);
      if (!changed(update)) {
        if (category && !(await exists("menu_categories", category))) return fail("not_found");
        return (await exists("menu_items", input.itemId)) ? fail("conflict") : fail("not_found");
      }
      const previous = before.imageObjectKey;
      const replaced = setImage === 1 && previous !== null && previous !== input.imageObjectKey;
      return ok({ previousImageObjectKey: replaced ? previous : null });
    },

    /** Apaga item com grupos, opções e Adicionais (cascade); devolve a chave da imagem. */
    async deleteItem(itemId: string): Promise<MenuResult<{ imageObjectKey: string | null }>> {
      requireOwner();
      const before = await d1
        .prepare(
          "SELECT image_object_key AS imageObjectKey FROM menu_items WHERE id = ? AND store_id = ?",
        )
        .bind(itemId, storeId)
        .first<{ imageObjectKey: string | null }>();
      if (!before) return fail("not_found");
      const [, removal] = await d1.batch([
        auditBeforeDelete("menu_items", itemId, "menu.item_deleted", utcNow()),
        d1.prepare("DELETE FROM menu_items WHERE id = ? AND store_id = ?").bind(itemId, storeId),
      ]);
      return changed(removal) ? ok({ imageObjectKey: before.imageObjectKey }) : fail("not_found");
    },

    reorderItems: (categoryId: string, orderedIds: string[]) =>
      reorder("menu_items", "category_id", categoryId, orderedIds, "menu.items_reordered"),

    // ---- Grupos de Complemento ---------------------------------------------------------

    async createComplementGroup(input: MenuGroupInput): Promise<MenuResult<{ groupId: string }>> {
      requireOwner();
      if (input.options.length > MENU_MAX_OPTIONS) return fail("invalid_input");
      const id = newId();
      const now = utcNow();
      const statements = [
        d1
          .prepare(
            `INSERT INTO menu_complement_groups (id, store_id, item_id, name, min_select, max_select, position, created_at, updated_at)
             SELECT ?, store_id, id, ?, ?, ?, ${nextPosition("menu_complement_groups", "item_id")}, ?, ?
             FROM menu_items WHERE id = ? AND store_id = ?`,
          )
          .bind(
            id,
            input.name,
            input.minSelect,
            input.maxSelect,
            storeId,
            input.itemId,
            now,
            now,
            input.itemId,
            storeId,
          ),
        ...input.options.map((option, position) => insertOption(id, option, position, now)),
        minSelectGuard(id),
        auditRow("menu_complement_groups", id, "menu.group_created", now, {
          options: input.options.length,
        }),
      ];
      const result = await runChecked(statements);
      if (!result.ok) return result;
      return changed(result.data[0]) ? ok({ groupId: id }) : fail("not_found");
    },

    async updateComplementGroup(input: MenuGroupUpdate): Promise<MenuResult<null>> {
      requireOwner();
      if (!(await exists("menu_complement_groups", input.groupId))) return fail("not_found");
      const now = utcNow();
      const statements: D1PreparedStatement[] = [
        d1
          .prepare(
            `UPDATE menu_complement_groups SET name = COALESCE(?, name),
               min_select = COALESCE(?, min_select), max_select = COALESCE(?, max_select),
               updated_at = ? WHERE id = ? AND store_id = ?`,
          )
          .bind(
            orNull(input.name),
            orNull(input.minSelect),
            orNull(input.maxSelect),
            now,
            input.groupId,
            storeId,
          ),
      ];
      if (input.options) {
        if (input.options.length > MENU_MAX_OPTIONS) return fail("invalid_input");
        const current = await idsOf("menu_complement_options", "group_id", input.groupId);
        const keep = input.options.flatMap((option) => (option.id ? [option.id] : []));
        // Opção de outro grupo/Loja não é "atualizada" em silêncio.
        if (keep.some((optionId) => !current.has(optionId))) return fail("not_found");
        statements.push(
          d1
            .prepare(
              `DELETE FROM menu_complement_options WHERE store_id = ? AND group_id = ?
               AND id NOT IN (SELECT value FROM json_each(?))`,
            )
            .bind(storeId, input.groupId, JSON.stringify(keep)),
        );
        input.options.forEach((option, position) => {
          statements.push(
            option.id
              ? d1
                  .prepare(
                    `UPDATE menu_complement_options SET name = ?, price_cents = ?, position = ?, updated_at = ?
                     WHERE id = ? AND store_id = ? AND group_id = ?`,
                  )
                  .bind(
                    option.name,
                    option.priceCents,
                    position,
                    now,
                    option.id,
                    storeId,
                    input.groupId,
                  )
              : insertOption(input.groupId, option, position, now),
          );
        });
      }
      statements.push(
        minSelectGuard(input.groupId),
        auditRow("menu_complement_groups", input.groupId, "menu.group_updated", now, {
          fields: sentFields(input, "groupId"),
        }),
      );
      const result = await runChecked(statements);
      if (!result.ok) return result;
      return changed(result.data[0]) ? ok(null) : fail("not_found");
    },

    async deleteComplementGroup(groupId: string): Promise<MenuResult<null>> {
      requireOwner();
      const [, removal] = await d1.batch([
        auditBeforeDelete("menu_complement_groups", groupId, "menu.group_deleted", utcNow()),
        d1
          .prepare("DELETE FROM menu_complement_groups WHERE id = ? AND store_id = ?")
          .bind(groupId, storeId),
      ]);
      return changed(removal) ? ok(null) : fail("not_found");
    },

    reorderComplementGroups: (itemId: string, orderedIds: string[]) =>
      reorder("menu_complement_groups", "item_id", itemId, orderedIds, "menu.groups_reordered"),

    /**
     * P-CAR-1: copia grupos (com opções e preços) de outro item desta Loja para o fim do item
     * alvo, com ids novos. Os valores saem do banco no próprio INSERT…SELECT (não do cliente).
     */
    async copyComplementGroups(input: {
      sourceItemId: string;
      targetItemId: string;
      groupIds?: string[] | undefined;
    }): Promise<MenuResult<{ groupIds: string[] }>> {
      requireOwner();
      if (input.sourceItemId === input.targetItemId) return fail("invalid_input");
      const [sourceOk, targetOk] = await Promise.all([
        exists("menu_items", input.sourceItemId),
        exists("menu_items", input.targetItemId),
      ]);
      if (!sourceOk || !targetOk) return fail("not_found");

      const groups = await d1
        .prepare(
          `SELECT id FROM menu_complement_groups WHERE store_id = ? AND item_id = ?
           ORDER BY position, created_at, id`,
        )
        .bind(storeId, input.sourceItemId)
        .all<{ id: string }>();
      const sourceIds = groups.results.map((row) => row.id);
      const chosen = input.groupIds
        ? sourceIds.filter((id) => input.groupIds?.includes(id))
        : sourceIds;
      if (input.groupIds && chosen.length !== input.groupIds.length) return fail("not_found");
      if (chosen.length === 0) return ok({ groupIds: [] });

      const options = await d1
        .prepare(
          `SELECT id, group_id AS groupId FROM menu_complement_options
           WHERE store_id = ? AND group_id IN (SELECT value FROM json_each(?))
           ORDER BY position, created_at, id`,
        )
        .bind(storeId, JSON.stringify(chosen))
        .all<{ id: string; groupId: string }>();
      const optionsByGroup = groupBy(options.results, (row) => row.groupId);

      const now = utcNow();
      const statements: D1PreparedStatement[] = [];
      const newIds: string[] = [];
      // Cada INSERT calcula MAX(position)+1 na hora: as cópias anteriores do mesmo batch já contam.
      for (const sourceGroupId of chosen) {
        const newGroupId = newId();
        newIds.push(newGroupId);
        statements.push(
          d1
            .prepare(
              `INSERT INTO menu_complement_groups (id, store_id, item_id, name, min_select, max_select, position, created_at, updated_at)
               SELECT ?, g.store_id, t.id, g.name, g.min_select, g.max_select,
                 COALESCE((SELECT MAX(position) + 1 FROM menu_complement_groups WHERE store_id = ? AND item_id = ?), 0),
                 ?, ?
               FROM menu_complement_groups g JOIN menu_items t ON t.store_id = g.store_id AND t.id = ?
               WHERE g.id = ? AND g.store_id = ? AND g.item_id = ?`,
            )
            .bind(
              newGroupId,
              storeId,
              input.targetItemId,
              now,
              now,
              input.targetItemId,
              sourceGroupId,
              storeId,
              input.sourceItemId,
            ),
        );
        for (const option of optionsByGroup.get(sourceGroupId) ?? []) {
          statements.push(
            d1
              .prepare(
                `INSERT INTO menu_complement_options (id, store_id, group_id, name, price_cents, position, created_at, updated_at)
                 SELECT ?, o.store_id, g.id, o.name, o.price_cents, o.position, ?, ?
                 FROM menu_complement_options o JOIN menu_complement_groups g ON g.store_id = o.store_id AND g.id = ?
                 WHERE o.id = ? AND o.store_id = ? AND o.group_id = ?`,
              )
              .bind(newId(), now, now, newGroupId, option.id, storeId, sourceGroupId),
          );
        }
        statements.push(minSelectGuard(newGroupId));
      }
      statements.push(
        audit("menu_items", input.targetItemId, "menu.groups_copied", now, {
          sourceItemId: input.sourceItemId,
          groups: newIds.length,
        }),
      );
      const result = await runChecked(statements);
      if (!result.ok) return result;
      return ok({ groupIds: newIds });
    },

    // ---- Adicionais ---------------------------------------------------------------------

    /** Item de outra Loja/inexistente = `not_found`; além de 40 por item = `conflict`. */
    async createAdditional(
      input: MenuAdditionalInput,
    ): Promise<MenuResult<{ additionalId: string }>> {
      requireOwner();
      const id = newId();
      const now = utcNow();
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO menu_additionals (id, store_id, item_id, name, price_cents, available, position, created_at, updated_at)
             SELECT ?, store_id, id, ?, ?, ?, ${nextPosition("menu_additionals", "item_id")}, ?, ?
             FROM menu_items WHERE id = ? AND store_id = ?
               AND (SELECT COUNT(*) FROM menu_additionals WHERE store_id = ? AND item_id = ?) < ?`,
          )
          .bind(
            id,
            input.name,
            input.priceCents,
            flag(input.available),
            storeId,
            input.itemId,
            now,
            now,
            input.itemId,
            storeId,
            storeId,
            input.itemId,
            MENU_MAX_ADDITIONALS,
          ),
        auditRow("menu_additionals", id, "menu.additional_created", now),
      ]);
      if (changed(insert)) return ok({ additionalId: id });
      return (await exists("menu_items", input.itemId)) ? fail("conflict") : fail("not_found");
    },

    async updateAdditional(input: MenuAdditionalUpdate): Promise<MenuResult<null>> {
      requireOwner();
      const now = utcNow();
      const [update] = await d1.batch([
        d1
          .prepare(
            `UPDATE menu_additionals SET name = COALESCE(?, name), price_cents = COALESCE(?, price_cents),
               available = COALESCE(?, available), updated_at = ? WHERE id = ? AND store_id = ?`,
          )
          .bind(
            orNull(input.name),
            orNull(input.priceCents),
            flag(input.available),
            now,
            input.additionalId,
            storeId,
          ),
        auditRow("menu_additionals", input.additionalId, "menu.additional_updated", now, {
          fields: sentFields(input, "additionalId"),
        }),
      ]);
      return changed(update) ? ok(null) : fail("not_found");
    },

    async deleteAdditional(additionalId: string): Promise<MenuResult<null>> {
      requireOwner();
      const [, removal] = await d1.batch([
        auditBeforeDelete("menu_additionals", additionalId, "menu.additional_deleted", utcNow()),
        d1
          .prepare("DELETE FROM menu_additionals WHERE id = ? AND store_id = ?")
          .bind(additionalId, storeId),
      ]);
      return changed(removal) ? ok(null) : fail("not_found");
    },

    reorderAdditionals: (itemId: string, orderedIds: string[]) =>
      reorder("menu_additionals", "item_id", itemId, orderedIds, "menu.additionals_reordered"),
  };
}

export type MenuOps = ReturnType<typeof createMenuOps>;
