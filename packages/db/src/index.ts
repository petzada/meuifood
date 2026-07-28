import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  type Prisma,
} from "./generated/prisma/client.js";

export type StoreContext = {
  storeId: string;
};

export type StaffContext = StoreContext & {
  membershipId: string;
  role: "owner" | "operator";
  userId: string;
};

export type StoreView = {
  billingMode: "pilot_platform" | "baas" | "merchant_own_account";
  id: string;
  name: string;
  slug: string;
};

export type StaffMemberView = {
  id: string;
  role: "owner" | "operator";
  userId: string;
};

export type BusinessDatabase = {
  addOperator(context: StaffContext, userId: string): Promise<StaffMemberView>;
  assertRestrictedRuntime(): Promise<void>;
  close(): Promise<void>;
  findStore(context: StoreContext, storeId: string): Promise<StoreView | null>;
  listStaffMembers(context: StaffContext): Promise<StaffMemberView[]>;
  removeOperator(context: StaffContext, membershipId: string): Promise<boolean>;
  resolveStaffContext(userId: string): Promise<StaffContext | null>;
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
  prisma: PrismaClient,
  context: StoreContext,
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
) {
  return await prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
      await transaction.$executeRaw`
        SELECT set_config('app.current_store_id', ${context.storeId}, true)
      `;

      return await operation(transaction);
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}

export function createBusinessDatabase(
  databaseUrl: string,
): BusinessDatabase {
  const prisma = prismaClient(databaseUrl);

  return {
    async addOperator(context, userId) {
      return await inStoreContext(
        prisma,
        context,
        async (transaction) =>
          await transaction.storeMember.create({
            data: { role: "operator", storeId: context.storeId, userId },
            select: { id: true, role: true, userId: true },
          }),
      );
    },
    async assertRestrictedRuntime() {
      await prisma.$transaction(async (transaction) => {
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
      });
    },
    async close() {
      await prisma.$disconnect();
    },
    async findStore(context, storeId) {
      return await inStoreContext(
        prisma,
        context,
        async (transaction) =>
          await transaction.store.findUnique({
            where: { id: storeId },
            select: storeViewSelect,
          }),
      );
    },
    async listStaffMembers(context) {
      return await inStoreContext(
        prisma,
        context,
        async (transaction) =>
          await transaction.storeMember.findMany({
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: { id: true, role: true, userId: true },
          }),
      );
    },
    async removeOperator(context, membershipId) {
      return await inStoreContext(
        prisma,
        context,
        async (transaction) => {
          const result = await transaction.storeMember.deleteMany({
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
    async resolveStaffContext(userId) {
      return await inStoreContext(
        prisma,
        { storeId: "00000000-0000-0000-0000-000000000000" },
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT set_config('app.current_user_id', ${userId}, true)
          `;
          const membership = await transaction.storeMember.findFirst({
            where: { userId },
            select: { id: true, role: true, storeId: true, userId: true },
          });
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
        prisma,
        context,
        async (transaction) => {
          const result = await transaction.store.updateMany({
            where: { id: storeId },
            data: { name },
          });
          if (result.count === 0) return null;

          return await transaction.store.findUnique({
            where: { id: storeId },
            select: storeViewSelect,
          });
        },
      );
    },
  };
}

export { BillingMode, MembershipRole } from "./generated/prisma/enums.js";
export { modelMerchant, seedModelMerchant } from "./seed.js";
