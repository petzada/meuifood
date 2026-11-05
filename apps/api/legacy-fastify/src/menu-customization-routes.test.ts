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
      "BUSINESS_DATABASE_URL é obrigatória para provar Complementos com RLS real.",
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

describe("Complementos, Adicionais e isolamento (Ticket 06)", { timeout: 30_000 }, () => {
  const runId = process.env.CI_RUN_ID ?? randomBytes(8).toString("hex");
  const createdStoreIds: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let operatorUserId: string;
  let ownerAUserId: string;
  let ownerBUserId: string;
  let storeAId: string;
  let storeASlug: string;
  let storeBId: string;

  beforeAll(async () => {
    const { administrativeUrl, businessUrl } = await productionDatabaseUrls();
    administrativeDatabase = createAdministrativeDatabase(administrativeUrl);
    businessDatabase = createBusinessDatabase(businessUrl);
    await businessDatabase.assertRestrictedRuntime();

    storeASlug = `fixture-comp-a-${runId}`;
    const storeA = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        name: `Fixture Comp A ${runId}`,
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
        name: `Fixture Comp B ${runId}`,
        slug: `fixture-comp-b-${runId}`,
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

  function appForCustomization() {
    return buildApp({
      businessDatabase,
      logger: false,
      verifyAccessToken: async (token) => {
        if (token === "owner-a") return { userId: ownerAUserId };
        if (token === "operator-a") return { userId: operatorUserId };
        if (token === "owner-b") return { userId: ownerBUserId };
        throw new Error("invalid_fixture_token");
      },
    });
  }

  it("Dono configura Complementos/Adicionais; Operador e cross-store são negados", async () => {
    const app = appForCustomization();
    try {
      const category = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { name: "Lanches" },
        url: "/menu/categories",
      });
      expect(category.statusCode).toBe(201);
      const categoryId = category.json().category.id as string;

      const item = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: true,
          categoryId,
          name: "X-Burger",
          priceCents: 2500,
        },
        url: "/menu/items",
      });
      expect(item.statusCode).toBe(201);
      const itemId = item.json().item.id as string;

      const categoryB = await administrativeDatabase.menuCategory.create({
        data: {
          name: "Categoria B",
          sortOrder: 0,
          storeId: storeBId,
        },
      });
      const itemB = await administrativeDatabase.menuItem.create({
        data: {
          categoryId: categoryB.id,
          name: "Item B",
          priceCents: 1000,
          storeId: storeBId,
        },
      });
      await expect(
        administrativeDatabase.menuAdditional.create({
          data: {
            itemId: itemB.id,
            name: "Referência cruzada",
            priceCents: 100,
            sortOrder: 0,
            storeId: storeAId,
          },
        }),
      ).rejects.toThrow();

      const operatorDenied = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Ponto",
          options: [{ name: "Mal passado" }],
          required: true,
        },
        url: "/menu/complement-groups",
      });
      expect(operatorDenied.statusCode).toBe(403);

      const requiredWithoutOptions = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Ponto",
          options: [],
          required: true,
        },
        url: "/menu/complement-groups",
      });
      expect(requiredWithoutOptions.statusCode).toBe(400);
      expect(requiredWithoutOptions.json()).toEqual({
        error: "required_group_needs_options",
      });
      const afterInvalidGroup = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: "/menu",
      });
      expect(afterInvalidGroup.statusCode).toBe(200);
      expect(afterInvalidGroup.json().complementGroups).toEqual([]);

      const group = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Ponto da carne",
          options: [{ name: "Mal passado" }, { name: "Ao ponto" }],
          required: true,
        },
        url: "/menu/complement-groups",
      });
      expect(group.statusCode).toBe(201);
      const groupId = group.json().group.id as string;
      expect(group.json().group.options).toHaveLength(2);
      expect(group.json().group.options[0].name).toBe("Mal passado");
      const originalOptionIds = group
        .json()
        .group.options.map((option: { id: string }) => option.id);

      const unchangedGroup = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: {
          name: "Ponto da carne",
          options: [{ name: "Mal passado" }, { name: "Ao ponto" }],
          required: true,
        },
        url: `/menu/complement-groups/${groupId}`,
      });
      expect(unchangedGroup.statusCode).toBe(200);
      expect(
        unchangedGroup
          .json()
          .group.options.map((option: { id: string }) => option.id),
      ).toEqual(originalOptionIds);

      const optionalGroup = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Observação",
          options: [{ name: "Sem cebola" }],
          required: false,
        },
        url: "/menu/complement-groups",
      });
      expect(optionalGroup.statusCode).toBe(201);
      const optionalGroupId = optionalGroup.json().group.id as string;

      const reorder = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: {
          itemId,
          orderedGroupIds: [optionalGroupId, groupId],
        },
        url: "/menu/complement-groups/order",
      });
      expect(reorder.statusCode).toBe(200);
      expect(reorder.json().groups.map((entry: { id: string }) => entry.id)).toEqual([
        optionalGroupId,
        groupId,
      ]);

      const additional = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: true,
          itemId,
          name: "Bacon",
          priceCents: 350,
        },
        url: "/menu/additionals",
      });
      expect(additional.statusCode).toBe(201);
      expect(additional.json().additional.priceCents).toBe(350);
      const additionalId = additional.json().additional.id as string;

      const unavailableAdditional = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: false,
          itemId,
          name: "Queijo extra",
          priceCents: 250,
        },
        url: "/menu/additionals",
      });
      expect(unavailableAdditional.statusCode).toBe(201);
      const unavailableAdditionalId = unavailableAdditional.json().additional
        .id as string;

      const reorderAdditionals = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: {
          itemId,
          orderedAdditionalIds: [unavailableAdditionalId, additionalId],
        },
        url: "/menu/additionals/order",
      });
      expect(reorderAdditionals.statusCode).toBe(200);
      expect(
        reorderAdditionals
          .json()
          .additionals.map((entry: { id: string }) => entry.id),
      ).toEqual([unavailableAdditionalId, additionalId]);

      const negativePrice = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Inválido",
          priceCents: -1,
        },
        url: "/menu/additionals",
      });
      expect(negativePrice.statusCode).toBe(400);

      const crossStore = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "PATCH",
        payload: { name: "Hack" },
        url: `/menu/additionals/${additionalId}`,
      });
      expect(crossStore.statusCode).toBe(404);

      const catalog = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: "/menu",
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json().complementGroups).toHaveLength(2);
      expect(catalog.json().additionals).toHaveLength(2);

      const publicMenu = await app.inject({
        method: "GET",
        url: `/public/stores/${storeASlug}/menu`,
      });
      expect(publicMenu.statusCode).toBe(200);
      const publicItem = publicMenu.json().storefront.categories[0].items[0];
      expect(publicItem.complementGroups).toHaveLength(2);
      expect(publicItem.complementGroups[0].id).toBe(optionalGroupId);
      expect(publicItem.additionals).toEqual([
        expect.objectContaining({ name: "Bacon", priceCents: 350 }),
      ]);
      expect(JSON.stringify(publicItem)).not.toContain("Queijo extra");
      expect(JSON.stringify(publicMenu.json())).not.toContain(storeAId);
      expect(JSON.stringify(publicMenu.json())).not.toContain("billingMode");

      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "DELETE",
        url: `/menu/items/${itemId}`,
      });
    } finally {
      await app.close();
    }
  });
});
