import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAdministrativeDatabase,
  createBusinessDatabase,
  type BusinessDatabase,
} from "@foode/db";

import { buildApp } from "./app.js";
import type { MenuImageStorage } from "./menu-image-storage.js";

function requiredSecret(source: string, name: string) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`${name} não foi configurada para o teste remoto.`);

  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  if (!unquoted) throw new Error(`${name} está vazia.`);
  return unquoted;
}

async function productionDatabaseUrls() {
  const environmentPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  const environmentPooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (Boolean(environmentPassword) !== Boolean(environmentPooler)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL devem ser configuradas juntas.",
    );
  }

  let password = environmentPassword;
  let pooler = environmentPooler;
  if (!password || !pooler) {
    const repositoryEnvironmentFile = new URL("../../../.env", import.meta.url);
    const linkedPoolerFile = new URL(
      "../../../supabase/.temp/pooler-url",
      import.meta.url,
    );
    if (
      !existsSync(repositoryEnvironmentFile) ||
      !existsSync(linkedPoolerFile)
    ) {
      throw new Error(
        "Configure as credenciais do Supabase de produção para a prova remota.",
      );
    }

    const [environmentFile, poolerFile] = await Promise.all([
      readFile(repositoryEnvironmentFile, "utf8"),
      readFile(linkedPoolerFile, "utf8"),
    ]);
    password = requiredSecret(environmentFile, "SUPABASE_DB_PASSWORD");
    pooler = poolerFile.trim();
  }

  const url = new URL(pooler);
  url.password = password;
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  const businessUrlValue = process.env.BUSINESS_DATABASE_URL?.trim();
  if (!businessUrlValue) {
    throw new Error(
      "BUSINESS_DATABASE_URL é obrigatória para provar o Cardápio com RLS real.",
    );
  }
  const businessUrl = new URL(businessUrlValue);
  if (
    businessUrl.hostname !== url.hostname ||
    !businessUrl.username.startsWith("foode_business")
  ) {
    throw new Error(
      "BUSINESS_DATABASE_URL deve usar foode_business no pooler do Foode Delivery.",
    );
  }
  businessUrl.searchParams.set("sslmode", "require");
  businessUrl.searchParams.set("uselibpqcompat", "true");
  return { administrativeUrl: url.toString(), businessUrl: businessUrl.toString() };
}

function syntheticTaxId() {
  return [...randomBytes(14)].map((byte) => String(byte % 10)).join("");
}

describe("Cardápio admin e storefront público", { timeout: 30_000 }, () => {
  const runId = process.env.CI_RUN_ID ?? randomBytes(8).toString("hex");
  const createdStoreIds: string[] = [];
  const deletedObjectKeys: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let operatorUserId: string;
  let ownerAUserId: string;
  let ownerBUserId: string;
  let storeAId: string;
  let storeASlug: string;
  let storeBId: string;

  const menuImageStorage: MenuImageStorage = {
    async createPresignedUpload({ objectKey }) {
      return {
        publicUrl: `https://img.test/${objectKey}`,
        uploadUrl: `https://upload.test/${objectKey}`,
      };
    },
    async deleteObject(objectKey) {
      deletedObjectKeys.push(objectKey);
    },
  };

  beforeAll(async () => {
    const { administrativeUrl, businessUrl } = await productionDatabaseUrls();
    administrativeDatabase = createAdministrativeDatabase(administrativeUrl);
    businessDatabase = createBusinessDatabase(businessUrl);
    await businessDatabase.assertRestrictedRuntime();

    storeASlug = `fixture-menu-a-${runId}`;
    const storeA = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        name: `Fixture Menu A ${runId}`,
        slug: storeASlug,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeA.id);
    storeAId = storeA.id;
    ownerAUserId = randomUUID();
    operatorUserId = randomUUID();
    await administrativeDatabase.storeMember.createMany({
      data: [
        { role: "owner", storeId: storeAId, userId: ownerAUserId },
        { role: "operator", storeId: storeAId, userId: operatorUserId },
      ],
    });

    const storeB = await administrativeDatabase.store.create({
      data: {
        billingMode: "merchant_own_account",
        name: `Fixture Menu B ${runId}`,
        slug: `fixture-menu-b-${runId}`,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeB.id);
    storeBId = storeB.id;
    ownerBUserId = randomUUID();
    await administrativeDatabase.storeMember.create({
      data: { role: "owner", storeId: storeBId, userId: ownerBUserId },
    });
  }, 60_000);

  afterAll(async () => {
    try {
      if (administrativeDatabase && createdStoreIds.length > 0) {
        await administrativeDatabase.store.deleteMany({
          where: { id: { in: createdStoreIds } },
        });
        const residueCount = await administrativeDatabase.store.count({
          where: { id: { in: createdStoreIds } },
        });
        expect(residueCount).toBe(0);
      }
    } finally {
      await businessDatabase?.close();
      await administrativeDatabase?.$disconnect();
    }
  });

  function appForMenu() {
    return buildApp({
      businessDatabase,
      logger: false,
      menuImagePublicBaseUrl: "https://img.test",
      menuImageStorage,
      verifyAccessToken: async (token) => {
        if (token === "owner-a") return { userId: ownerAUserId };
        if (token === "operator-a") return { userId: operatorUserId };
        if (token === "owner-b") return { userId: ownerBUserId };
        throw new Error("invalid_fixture_token");
      },
    });
  }

  it("Dono gerencia categorias e itens; Operador e outra Loja são negados", async () => {
    const app = appForMenu();
    try {
      const operatorList = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "GET",
        url: "/menu",
      });
      expect(operatorList.statusCode).toBe(403);

      const createdCategory = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { name: "Lanches" },
        url: "/menu/categories",
      });
      expect(createdCategory.statusCode).toBe(201);
      const categoryId = createdCategory.json().category.id as string;

      const secondCategory = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { name: "Bebidas" },
        url: "/menu/categories",
      });
      expect(secondCategory.statusCode).toBe(201);
      const secondCategoryId = secondCategory.json().category.id as string;

      const reorder = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { orderedCategoryIds: [secondCategoryId, categoryId] },
        url: "/menu/categories/order",
      });
      expect(reorder.statusCode).toBe(200);
      expect(reorder.json().categories.map((category: { id: string }) => category.id)).toEqual([
        secondCategoryId,
        categoryId,
      ]);

      const createdItem = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: true,
          categoryId,
          description: "Pão, carne e queijo",
          name: "X-Burger",
          priceCents: 2590,
        },
        url: "/menu/items",
      });
      expect(createdItem.statusCode).toBe(201);
      const itemId = createdItem.json().item.id as string;
      expect(createdItem.json().item.priceCents).toBe(2590);

      const deleteCategoryWithItems = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "DELETE",
        url: `/menu/categories/${categoryId}`,
      });
      expect(deleteCategoryWithItems.statusCode).toBe(409);
      expect(deleteCategoryWithItems.json()).toEqual({ error: "category_has_items" });

      const crossStoreItem = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "PATCH",
        payload: { name: "Invadido" },
        url: `/menu/items/${itemId}`,
      });
      expect(crossStoreItem.statusCode).toBe(404);

      const unavailable = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PATCH",
        payload: { available: false },
        url: `/menu/items/${itemId}`,
      });
      expect(unavailable.statusCode).toBe(200);

      const publicUnknown = await app.inject({
        method: "GET",
        url: "/public/stores/slug-desconhecido-xyz/menu",
      });
      expect(publicUnknown.statusCode).toBe(404);
      expect(publicUnknown.json()).toEqual({ error: "store_not_found" });
      expect(publicUnknown.body).not.toContain(storeAId);

      const publicEmpty = await app.inject({
        method: "GET",
        url: `/public/stores/${storeASlug}/menu`,
      });
      expect(publicEmpty.statusCode).toBe(200);
      const emptyPayload = publicEmpty.json();
      expect(emptyPayload.storefront.name).toBe(`Fixture Menu A ${runId}`);
      expect(emptyPayload.storefront.slug).toBe(storeASlug);
      expect(emptyPayload.storefront.categories).toEqual([]);
      expect(JSON.stringify(emptyPayload)).not.toContain("billingMode");
      expect(JSON.stringify(emptyPayload)).not.toContain("pilot_platform");
      expect(JSON.stringify(emptyPayload)).not.toContain("baas");
      expect(JSON.stringify(emptyPayload)).not.toContain(storeAId);
      expect(JSON.stringify(emptyPayload)).not.toContain("taxId");

      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PATCH",
        payload: { available: true },
        url: `/menu/items/${itemId}`,
      });

      const publicMenu = await app.inject({
        method: "GET",
        url: `/public/stores/${storeASlug}/menu`,
      });
      expect(publicMenu.statusCode).toBe(200);
      const storefront = publicMenu.json().storefront;
      expect(storefront.categories).toHaveLength(1);
      expect(storefront.categories[0].name).toBe("Lanches");
      expect(storefront.categories[0].items[0]).toMatchObject({
        description: "Pão, carne e queijo",
        name: "X-Burger",
        priceCents: 2590,
      });

      const objectKey = `stores/${storeAId}/menu/${randomUUID()}.webp`;
      const withImage = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PATCH",
        payload: { imageObjectKey: objectKey },
        url: `/menu/items/${itemId}`,
      });
      expect(withImage.statusCode).toBe(200);
      expect(withImage.json().item.imageUrl).toBe(`https://img.test/${objectKey}`);

      const foreignKey = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PATCH",
        payload: {
          imageObjectKey: `stores/${storeBId}/menu/${randomUUID()}.webp`,
        },
        url: `/menu/items/${itemId}`,
      });
      expect(foreignKey.statusCode).toBe(400);

      const presignOperator = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { contentLength: 1024, contentType: "image/png" },
        url: "/menu/images/presign",
      });
      expect(presignOperator.statusCode).toBe(403);

      const presign = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { contentLength: 1024, contentType: "image/png" },
        url: "/menu/images/presign",
      });
      expect(presign.statusCode).toBe(200);
      expect(presign.json().objectKey).toMatch(
        new RegExp(`^stores/${storeAId}/menu/[0-9a-f-]+\\.png$`, "u"),
      );
      expect(presign.json().uploadUrl).toContain("https://upload.test/");

      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "DELETE",
        url: `/menu/items/${itemId}`,
      });
      expect(deletedObjectKeys).toContain(objectKey);

      const deleteEmptyCategory = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "DELETE",
        url: `/menu/categories/${categoryId}`,
      });
      expect(deleteEmptyCategory.statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });
});
