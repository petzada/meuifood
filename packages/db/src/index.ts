import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export type StoreContext = {
  storeId: string;
};

export type StoreView = {
  billingMode: "pilot_platform" | "baas" | "merchant_own_account";
  id: string;
  name: string;
  slug: string;
};

export type BusinessDatabase = {
  close(): Promise<void>;
  findStore(context: StoreContext, storeId: string): Promise<StoreView | null>;
  updateStoreName(
    context: StoreContext,
    storeId: string,
    name: string,
  ): Promise<StoreView | null>;
};

type BusinessDatabaseOptions = {
  assumeBusinessRole?: boolean;
};

function prismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function createAdministrativeDatabase(databaseUrl: string) {
  return prismaClient(databaseUrl);
}

export function createBusinessDatabase(
  databaseUrl: string,
  options: BusinessDatabaseOptions = {},
): BusinessDatabase {
  const prisma = prismaClient(databaseUrl);

  return {
    async close() {
      await prisma.$disconnect();
    },
    async findStore(context, storeId) {
      return await prisma.$transaction(
        async (transaction) => {
          if (options.assumeBusinessRole) {
            await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
          }
          await transaction.$executeRaw`
            SELECT set_config('app.current_store_id', ${context.storeId}, true)
          `;

          return await transaction.store.findUnique({
            where: { id: storeId },
            select: {
              billingMode: true,
              id: true,
              name: true,
              slug: true,
            },
          });
        },
        { maxWait: 15_000, timeout: 15_000 },
      );
    },
    async updateStoreName(context, storeId, name) {
      return await prisma.$transaction(
        async (transaction) => {
          if (options.assumeBusinessRole) {
            await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
          }
          await transaction.$executeRaw`
            SELECT set_config('app.current_store_id', ${context.storeId}, true)
          `;

          const result = await transaction.store.updateMany({
            where: { id: storeId },
            data: { name },
          });
          if (result.count === 0) return null;

          return await transaction.store.findUnique({
            where: { id: storeId },
            select: {
              billingMode: true,
              id: true,
              name: true,
              slug: true,
            },
          });
        },
        { maxWait: 15_000, timeout: 15_000 },
      );
    },
  };
}

export { BillingMode, MembershipRole } from "./generated/prisma/enums.js";
export { modelMerchant, seedModelMerchant } from "./seed.js";
