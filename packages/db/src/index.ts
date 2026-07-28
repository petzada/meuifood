import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  type Prisma,
} from "./generated/prisma/client.js";
import type { MembershipRole } from "./generated/prisma/enums.js";

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

export type BusinessDatabase = {
  addOperator(context: MembershipContext, userId: string): Promise<TeamMemberView>;
  assertRestrictedRuntime(): Promise<void>;
  close(): Promise<void>;
  findStore(context: StoreContext, storeId: string): Promise<StoreView | null>;
  listTeamMembers(context: MembershipContext): Promise<TeamMemberView[]>;
  removeOperator(context: MembershipContext, membershipId: string): Promise<boolean>;
  resolveMembershipContext(userId: string): Promise<MembershipContext | null>;
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
    async findStore(context, storeId) {
      return await withDatabase((database) =>
        database.findStore(context, storeId),
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
    async resolveMembershipContext(userId) {
      return await withDatabase((database) =>
        database.resolveMembershipContext(userId),
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
