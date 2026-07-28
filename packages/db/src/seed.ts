import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export const modelMerchant = {
  billingMode: "pilot_platform" as const,
  name: "Foode Comerciante Modelo",
  slug: "comerciante-modelo",
  taxId: "00000000000191",
};

export async function seedModelMerchant(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    return await prisma.store.upsert({
      where: { slug: modelMerchant.slug },
      create: modelMerchant,
      update: modelMerchant,
    });
  } finally {
    await prisma.$disconnect();
  }
}
