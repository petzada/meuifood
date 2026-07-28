import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  type Prisma,
} from "./generated/prisma/client.js";
import type { MembershipRole } from "./generated/prisma/enums.js";
import {
  createAdditional as createAdditionalRecord,
  createComplementGroupWithOptions,
  deleteAdditional as deleteAdditionalRecord,
  deleteComplementGroup as deleteComplementGroupRecord,
  listItemCustomizations,
  reorderAdditionals as reorderAdditionalsRecords,
  reorderComplementGroups as reorderComplementGroupRecords,
  replaceComplementGroupOptions,
  updateAdditional as updateAdditionalRecord,
  type AdditionalView,
  type ComplementGroupView,
  type PublicAdditionalView,
  type PublicComplementGroupView,
} from "./menu-customization.js";

export type {
  AdditionalView,
  ComplementGroupView,
  ComplementOptionView,
  PublicAdditionalView,
  PublicComplementGroupView,
  PublicComplementOptionView,
} from "./menu-customization.js";

export type StoreContext = {
  storeId: string;
};

export type MembershipContext = StoreContext & {
  membershipId: string;
  role: MembershipRole;
  userId: string;
};

export type StoreView = {
  billingMode: "pilot_platform" | "baas" | "merchant_own_account";
  id: string;
  name: string;
  slug: string;
};

export type TeamMemberView = {
  id: string;
  role: MembershipRole;
  userId: string;
};

export type MenuCategoryView = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MenuItemView = {
  available: boolean;
  categoryId: string;
  description: string;
  id: string;
  imageObjectKey: string | null;
  name: string;
  priceCents: number;
};

export type MenuCatalogView = {
  additionals: AdditionalView[];
  categories: MenuCategoryView[];
  complementGroups: ComplementGroupView[];
  items: MenuItemView[];
};

export type PublicMenuItemView = {
  additionals: PublicAdditionalView[];
  complementGroups: PublicComplementGroupView[];
  description: string;
  id: string;
  imageUrl: string | null;
  name: string;
  priceCents: number;
};

export type PublicMenuCategoryView = {
  id: string;
  items: PublicMenuItemView[];
  name: string;
};

export type PublicStorefrontView = {
  categories: PublicMenuCategoryView[];
  name: string;
  slug: string;
};

export type BusinessDatabase = {
  addOperator(context: MembershipContext, userId: string): Promise<TeamMemberView>;
  assertRestrictedRuntime(): Promise<void>;
  close(): Promise<void>;
  createMenuCategory(
    context: StoreContext,
    input: { name: string },
  ): Promise<MenuCategoryView>;
  createAdditional(
    context: StoreContext,
    input: {
      available?: boolean;
      itemId: string;
      name: string;
      priceCents: number;
    },
  ): Promise<AdditionalView | null>;
  createComplementGroup(
    context: StoreContext,
    input: {
      itemId: string;
      name: string;
      options: Array<{ name: string }>;
      required: boolean;
    },
  ): Promise<ComplementGroupView | null>;
  createMenuItem(
    context: StoreContext,
    input: {
      available?: boolean;
      categoryId: string;
      description?: string;
      imageObjectKey?: string | null;
      name: string;
      priceCents: number;
    },
  ): Promise<MenuItemView | null>;
  deleteAdditional(context: StoreContext, additionalId: string): Promise<boolean>;
  deleteComplementGroup(context: StoreContext, groupId: string): Promise<boolean>;
  deleteMenuCategory(
    context: StoreContext,
    categoryId: string,
  ): Promise<"deleted" | "not_found" | "has_items">;
  deleteMenuItem(context: StoreContext, itemId: string): Promise<MenuItemView | null>;
  findStore(context: StoreContext, storeId: string): Promise<StoreView | null>;
  findPublicStorefrontBySlug(
    slug: string,
    publicImageUrl: (objectKey: string) => string | null,
  ): Promise<PublicStorefrontView | null>;
  getMenuItem(
    context: StoreContext,
    itemId: string,
  ): Promise<MenuItemView | null>;
  listMenuCatalog(context: StoreContext): Promise<MenuCatalogView>;
  listTeamMembers(context: MembershipContext): Promise<TeamMemberView[]>;
  removeOperator(context: MembershipContext, membershipId: string): Promise<boolean>;
  reorderAdditionals(
    context: StoreContext,
    itemId: string,
    orderedAdditionalIds: string[],
  ): Promise<AdditionalView[] | null>;
  reorderComplementGroups(
    context: StoreContext,
    itemId: string,
    orderedGroupIds: string[],
  ): Promise<ComplementGroupView[] | null>;
  reorderMenuCategories(
    context: StoreContext,
    orderedCategoryIds: string[],
  ): Promise<MenuCategoryView[] | null>;
  replaceComplementGroup(
    context: StoreContext,
    groupId: string,
    input: {
      name?: string;
      options: Array<{ name: string }>;
      required?: boolean;
    },
  ): Promise<ComplementGroupView | null>;
  resolveMembershipContext(userId: string): Promise<MembershipContext | null>;
  updateAdditional(
    context: StoreContext,
    additionalId: string,
    input: {
      available?: boolean;
      name?: string;
      priceCents?: number;
    },
  ): Promise<AdditionalView | null>;
  updateMenuCategory(
    context: StoreContext,
    categoryId: string,
    input: { name: string },
  ): Promise<MenuCategoryView | null>;
  updateMenuItem(
    context: StoreContext,
    itemId: string,
    input: {
      available?: boolean;
      categoryId?: string;
      description?: string;
      imageObjectKey?: string | null;
      name?: string;
      priceCents?: number;
    },
  ): Promise<MenuItemView | null>;
  updateStoreName(
    context: StoreContext,
    storeId: string,
    name: string,
  ): Promise<StoreView | null>;
};

const storeViewSelect = {
  billingMode: true,
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.StoreSelect;

const menuCategorySelect = {
  id: true,
  name: true,
  sortOrder: true,
} satisfies Prisma.MenuCategorySelect;

const menuItemSelect = {
  available: true,
  categoryId: true,
  description: true,
  id: true,
  imageObjectKey: true,
  name: true,
  priceCents: true,
} satisfies Prisma.MenuItemSelect;

function prismaClient(databaseUrl: string) {
  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.set("sslmode", "require");
  connectionUrl.searchParams.set("uselibpqcompat", "true");
  const adapter = new PrismaPg({ connectionString: connectionUrl.toString() });
  return new PrismaClient({ adapter });
}

export function createAdministrativeDatabase(databaseUrl: string) {
  return prismaClient(databaseUrl);
}

async function inStoreContext<Result>(
  transaction: Prisma.TransactionClient,
  context: StoreContext,
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
) {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${context.storeId}, true)
  `;

  return await operation(transaction);
}

export function createTransactionalBusinessDatabase(
  transaction: Prisma.TransactionClient,
): BusinessDatabase {
  return {
    async addOperator(context, userId) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) =>
          await storeTransaction.storeMember.create({
            data: { role: "operator", storeId: context.storeId, userId },
            select: { id: true, role: true, userId: true },
          }),
      );
    },
    async assertRestrictedRuntime() {
      await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
      const [runtime] = await transaction.$queryRaw<
        Array<{
          bypassRls: boolean;
          roleName: string;
          sessionUserName: string;
        }>
      >`
        SELECT
          current_user::text AS "roleName",
          session_user::text AS "sessionUserName",
          COALESCE(
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user),
            true
          ) AS "bypassRls"
      `;
      if (
        !runtime ||
        runtime.roleName !== "foode_business" ||
        runtime.bypassRls ||
        runtime.sessionUserName === "postgres"
      ) {
        throw new Error("business_database_role_is_not_restricted");
      }
    },
    async close() {},
    async createAdditional(context, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await createAdditionalRecord(storeTransaction, context.storeId, input),
      );
    },
    async createComplementGroup(context, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await createComplementGroupWithOptions(
          storeTransaction,
          context.storeId,
          input,
        ),
      );
    },
    async createMenuCategory(context, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const aggregate = await storeTransaction.menuCategory.aggregate({
          _max: { sortOrder: true },
        });
        const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;
        return await storeTransaction.menuCategory.create({
          data: {
            name: input.name,
            sortOrder,
            storeId: context.storeId,
          },
          select: menuCategorySelect,
        });
      });
    },
    async createMenuItem(context, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const category = await storeTransaction.menuCategory.findFirst({
          where: { id: input.categoryId, storeId: context.storeId },
          select: { id: true },
        });
        if (!category) return null;

        return await storeTransaction.menuItem.create({
          data: {
            available: input.available ?? true,
            categoryId: input.categoryId,
            description: input.description ?? "",
            imageObjectKey: input.imageObjectKey ?? null,
            name: input.name,
            priceCents: input.priceCents,
            storeId: context.storeId,
          },
          select: menuItemSelect,
        });
      });
    },
    async deleteAdditional(context, additionalId) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await deleteAdditionalRecord(
          storeTransaction,
          context.storeId,
          additionalId,
        ),
      );
    },
    async deleteComplementGroup(context, groupId) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await deleteComplementGroupRecord(
          storeTransaction,
          context.storeId,
          groupId,
        ),
      );
    },
    async deleteMenuCategory(context, categoryId) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const category = await storeTransaction.menuCategory.findFirst({
          where: { id: categoryId, storeId: context.storeId },
          select: { id: true },
        });
        if (!category) return "not_found";

        const itemCount = await storeTransaction.menuItem.count({
          where: { categoryId, storeId: context.storeId },
        });
        if (itemCount > 0) return "has_items";

        await storeTransaction.menuCategory.delete({ where: { id: categoryId } });
        return "deleted";
      });
    },
    async deleteMenuItem(context, itemId) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const existing = await storeTransaction.menuItem.findFirst({
          where: { id: itemId, storeId: context.storeId },
          select: menuItemSelect,
        });
        if (!existing) return null;
        await storeTransaction.menuItem.delete({ where: { id: itemId } });
        return existing;
      });
    },
    async findStore(context, storeId) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) =>
          await storeTransaction.store.findUnique({
            where: { id: storeId },
            select: storeViewSelect,
          }),
      );
    },
    async findPublicStorefrontBySlug(slug, publicImageUrl) {
      await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
      await transaction.$executeRaw`
        SELECT set_config('app.public_slug', ${slug}, true)
      `;
      await transaction.$executeRaw`
        SELECT set_config('app.current_store_id', '', true)
      `;

      const store = await transaction.store.findFirst({
        where: { slug },
        select: { id: true, name: true, slug: true },
      });
      if (!store) return null;

      await transaction.$executeRaw`
        SELECT set_config('app.current_store_id', ${store.id}, true)
      `;

      const categories = await transaction.menuCategory.findMany({
        where: { storeId: store.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          items: {
            where: { available: true },
            orderBy: [{ createdAt: "asc" }],
            select: {
              description: true,
              id: true,
              imageObjectKey: true,
              name: true,
              priceCents: true,
            },
          },
        },
      });

      const itemIds = categories.flatMap((category) =>
        category.items.map((item) => item.id),
      );
      const customizations = await listItemCustomizations(transaction, itemIds);
      const groupsByItem = new Map<string, typeof customizations.complementGroups>();
      for (const group of customizations.complementGroups) {
        const list = groupsByItem.get(group.itemId) ?? [];
        list.push(group);
        groupsByItem.set(group.itemId, list);
      }
      const additionalsByItem = new Map<string, typeof customizations.additionals>();
      for (const additional of customizations.additionals) {
        if (!additional.available) continue;
        const list = additionalsByItem.get(additional.itemId) ?? [];
        list.push(additional);
        additionalsByItem.set(additional.itemId, list);
      }

      return {
        name: store.name,
        slug: store.slug,
        categories: categories
          .filter((category) => category.items.length > 0)
          .map((category) => ({
            id: category.id,
            name: category.name,
            items: category.items.map((item) => ({
              additionals: (additionalsByItem.get(item.id) ?? []).map(
                (additional) => ({
                  id: additional.id,
                  name: additional.name,
                  priceCents: additional.priceCents,
                }),
              ),
              complementGroups: (groupsByItem.get(item.id) ?? []).map((group) => ({
                id: group.id,
                name: group.name,
                required: group.required,
                options: group.options.map((option) => ({
                  id: option.id,
                  name: option.name,
                })),
              })),
              description: item.description,
              id: item.id,
              imageUrl: item.imageObjectKey
                ? publicImageUrl(item.imageObjectKey)
                : null,
              name: item.name,
              priceCents: item.priceCents,
            })),
          })),
      };
    },
    async getMenuItem(context, itemId) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) =>
          await storeTransaction.menuItem.findFirst({
            where: { id: itemId, storeId: context.storeId },
            select: menuItemSelect,
          }),
      );
    },
    async listMenuCatalog(context) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const [categories, items] = await Promise.all([
          storeTransaction.menuCategory.findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: menuCategorySelect,
          }),
          storeTransaction.menuItem.findMany({
            orderBy: [{ createdAt: "asc" }],
            select: menuItemSelect,
          }),
        ]);
        const customizations = await listItemCustomizations(
          storeTransaction,
          items.map((item) => item.id),
        );
        return {
          additionals: customizations.additionals,
          categories,
          complementGroups: customizations.complementGroups,
          items,
        };
      });
    },
    async listTeamMembers(context) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) =>
          await storeTransaction.storeMember.findMany({
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: { id: true, role: true, userId: true },
          }),
      );
    },
    async removeOperator(context, membershipId) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) => {
          const result = await storeTransaction.storeMember.deleteMany({
            where: {
              id: membershipId,
              role: "operator",
              storeId: context.storeId,
            },
          });
          return result.count === 1;
        },
      );
    },
    async reorderAdditionals(context, itemId, orderedAdditionalIds) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await reorderAdditionalsRecords(
          storeTransaction,
          context.storeId,
          itemId,
          orderedAdditionalIds,
        ),
      );
    },
    async reorderComplementGroups(context, itemId, orderedGroupIds) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await reorderComplementGroupRecords(
          storeTransaction,
          context.storeId,
          itemId,
          orderedGroupIds,
        ),
      );
    },
    async reorderMenuCategories(context, orderedCategoryIds) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const existing = await storeTransaction.menuCategory.findMany({
          select: { id: true },
        });
        if (
          existing.length !== orderedCategoryIds.length ||
          new Set(orderedCategoryIds).size !== orderedCategoryIds.length
        ) {
          return null;
        }
        const existingIds = new Set(existing.map(({ id }) => id));
        if (orderedCategoryIds.some((id) => !existingIds.has(id))) {
          return null;
        }

        await Promise.all(
          orderedCategoryIds.map((id, index) =>
            storeTransaction.menuCategory.update({
              where: { id },
              data: { sortOrder: index },
            }),
          ),
        );

        return await storeTransaction.menuCategory.findMany({
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: menuCategorySelect,
        });
      });
    },
    async replaceComplementGroup(context, groupId, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await replaceComplementGroupOptions(
          storeTransaction,
          context.storeId,
          groupId,
          input,
        ),
      );
    },
    async resolveMembershipContext(userId) {
      return await inStoreContext(
        transaction,
        { storeId: "00000000-0000-0000-0000-000000000000" },
        async (storeTransaction) => {
          await storeTransaction.$executeRaw`
            SELECT set_config('app.current_user_id', ${userId}, true)
          `;
          const memberships = await storeTransaction.storeMember.findMany({
            where: { userId },
            select: { id: true, role: true, storeId: true, userId: true },
            take: 2,
          });
          const membership = memberships.length === 1 ? memberships[0] : undefined;
          return membership
            ? {
                membershipId: membership.id,
                role: membership.role,
                storeId: membership.storeId,
                userId: membership.userId,
              }
            : null;
        },
      );
    },
    async updateAdditional(context, additionalId, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) =>
        await updateAdditionalRecord(
          storeTransaction,
          context.storeId,
          additionalId,
          input,
        ),
      );
    },
    async updateMenuCategory(context, categoryId, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        const result = await storeTransaction.menuCategory.updateMany({
          where: { id: categoryId, storeId: context.storeId },
          data: { name: input.name },
        });
        if (result.count === 0) return null;
        return await storeTransaction.menuCategory.findUnique({
          where: { id: categoryId },
          select: menuCategorySelect,
        });
      });
    },
    async updateMenuItem(context, itemId, input) {
      return await inStoreContext(transaction, context, async (storeTransaction) => {
        if (input.categoryId) {
          const category = await storeTransaction.menuCategory.findFirst({
            where: { id: input.categoryId, storeId: context.storeId },
            select: { id: true },
          });
          if (!category) return null;
        }

        const result = await storeTransaction.menuItem.updateMany({
          where: { id: itemId, storeId: context.storeId },
          data: {
            ...(input.available === undefined
              ? {}
              : { available: input.available }),
            ...(input.categoryId === undefined
              ? {}
              : { categoryId: input.categoryId }),
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.imageObjectKey === undefined
              ? {}
              : { imageObjectKey: input.imageObjectKey }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.priceCents === undefined
              ? {}
              : { priceCents: input.priceCents }),
          },
        });
        if (result.count === 0) return null;
        return await storeTransaction.menuItem.findUnique({
          where: { id: itemId },
          select: menuItemSelect,
        });
      });
    },
    async updateStoreName(context, storeId, name) {
      return await inStoreContext(
        transaction,
        context,
        async (storeTransaction) => {
          const result = await storeTransaction.store.updateMany({
            where: { id: storeId },
            data: { name },
          });
          if (result.count === 0) return null;

          return await storeTransaction.store.findUnique({
            where: { id: storeId },
            select: storeViewSelect,
          });
        },
      );
    },
  };
}

export function createBusinessDatabase(databaseUrl: string): BusinessDatabase {
  const prisma = prismaClient(databaseUrl);
  const withDatabase = async <Result>(
    operation: (database: BusinessDatabase) => Promise<Result>,
  ) =>
    await prisma.$transaction(
      async (transaction) =>
        await operation(createTransactionalBusinessDatabase(transaction)),
      { maxWait: 15_000, timeout: 15_000 },
    );

  return {
    async addOperator(context, userId) {
      return await withDatabase((database) =>
        database.addOperator(context, userId),
      );
    },
    async assertRestrictedRuntime() {
      await withDatabase((database) => database.assertRestrictedRuntime());
    },
    async close() {
      await prisma.$disconnect();
    },
    async createAdditional(context, input) {
      return await withDatabase((database) =>
        database.createAdditional(context, input),
      );
    },
    async createComplementGroup(context, input) {
      return await withDatabase((database) =>
        database.createComplementGroup(context, input),
      );
    },
    async createMenuCategory(context, input) {
      return await withDatabase((database) =>
        database.createMenuCategory(context, input),
      );
    },
    async createMenuItem(context, input) {
      return await withDatabase((database) =>
        database.createMenuItem(context, input),
      );
    },
    async deleteAdditional(context, additionalId) {
      return await withDatabase((database) =>
        database.deleteAdditional(context, additionalId),
      );
    },
    async deleteComplementGroup(context, groupId) {
      return await withDatabase((database) =>
        database.deleteComplementGroup(context, groupId),
      );
    },
    async deleteMenuCategory(context, categoryId) {
      return await withDatabase((database) =>
        database.deleteMenuCategory(context, categoryId),
      );
    },
    async deleteMenuItem(context, itemId) {
      return await withDatabase((database) =>
        database.deleteMenuItem(context, itemId),
      );
    },
    async findStore(context, storeId) {
      return await withDatabase((database) =>
        database.findStore(context, storeId),
      );
    },
    async findPublicStorefrontBySlug(slug, publicImageUrl) {
      return await withDatabase((database) =>
        database.findPublicStorefrontBySlug(slug, publicImageUrl),
      );
    },
    async getMenuItem(context, itemId) {
      return await withDatabase((database) =>
        database.getMenuItem(context, itemId),
      );
    },
    async listMenuCatalog(context) {
      return await withDatabase((database) =>
        database.listMenuCatalog(context),
      );
    },
    async listTeamMembers(context) {
      return await withDatabase((database) =>
        database.listTeamMembers(context),
      );
    },
    async removeOperator(context, membershipId) {
      return await withDatabase((database) =>
        database.removeOperator(context, membershipId),
      );
    },
    async reorderAdditionals(context, itemId, orderedAdditionalIds) {
      return await withDatabase((database) =>
        database.reorderAdditionals(context, itemId, orderedAdditionalIds),
      );
    },
    async reorderComplementGroups(context, itemId, orderedGroupIds) {
      return await withDatabase((database) =>
        database.reorderComplementGroups(context, itemId, orderedGroupIds),
      );
    },
    async reorderMenuCategories(context, orderedCategoryIds) {
      return await withDatabase((database) =>
        database.reorderMenuCategories(context, orderedCategoryIds),
      );
    },
    async replaceComplementGroup(context, groupId, input) {
      return await withDatabase((database) =>
        database.replaceComplementGroup(context, groupId, input),
      );
    },
    async resolveMembershipContext(userId) {
      return await withDatabase((database) =>
        database.resolveMembershipContext(userId),
      );
    },
    async updateAdditional(context, additionalId, input) {
      return await withDatabase((database) =>
        database.updateAdditional(context, additionalId, input),
      );
    },
    async updateMenuCategory(context, categoryId, input) {
      return await withDatabase((database) =>
        database.updateMenuCategory(context, categoryId, input),
      );
    },
    async updateMenuItem(context, itemId, input) {
      return await withDatabase((database) =>
        database.updateMenuItem(context, itemId, input),
      );
    },
    async updateStoreName(context, storeId, name) {
      return await withDatabase((database) =>
        database.updateStoreName(context, storeId, name),
      );
    },
  };
}

export { BillingMode, MembershipRole } from "./generated/prisma/enums.js";
export { modelMerchant, seedModelMerchant } from "./seed.js";
