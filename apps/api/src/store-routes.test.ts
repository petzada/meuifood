import { randomBytes } from "node:crypto";
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

async function productionDatabaseUrl() {
  const [environmentFile, poolerFile] = await Promise.all([
    readFile(new URL("../../../.env", import.meta.url), "utf8"),
    readFile(
      new URL("../../../supabase/.temp/pooler-url", import.meta.url),
      "utf8",
    ),
  ]);
  const url = new URL(poolerFile.trim());
  url.password = requiredSecret(environmentFile, "SUPABASE_DB_PASSWORD");
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

function syntheticTaxId() {
  return [...randomBytes(14)].map((byte) => String(byte % 10)).join("");
}

describe("isolamento de Loja pela API e RLS no Supabase de produção", () => {
  const runId = randomBytes(8).toString("hex");
  const createdStoreIds: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    const databaseUrl = await productionDatabaseUrl();
    administrativeDatabase = createAdministrativeDatabase(databaseUrl);
    businessDatabase = createBusinessDatabase(databaseUrl, {
      assumeBusinessRole: true,
    });

    const storeA = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        name: `Fixture RLS A ${runId}`,
        slug: `fixture-rls-a-${runId}`,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeA.id);
    const storeB = await administrativeDatabase.store.create({
      data: {
        billingMode: "merchant_own_account",
        name: `Fixture RLS B ${runId}`,
        slug: `fixture-rls-b-${runId}`,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeB.id);
    storeAId = storeA.id;
    storeBId = storeB.id;
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

  function appForSyntheticStores() {
    return buildApp({
      businessDatabase,
      logger: false,
      resolveStoreContext: async (request) => {
        if (request.headers.authorization === "Bearer fixture-a") {
          return { storeId: storeAId };
        }
        if (request.headers.authorization === "Bearer fixture-b") {
          return { storeId: storeBId };
        }
        return undefined;
      },
    });
  }

  it("uma Loja não lê a linha de outra Loja", async () => {
    const app = appForSyntheticStores();
    try {
      const ownResponse = await app.inject({
        headers: { authorization: "Bearer fixture-a" },
        method: "GET",
        url: `/stores/${storeAId}`,
      });
      const crossStoreResponse = await app.inject({
        headers: { authorization: "Bearer fixture-a" },
        method: "GET",
        url: `/stores/${storeBId}`,
      });

      expect(ownResponse.statusCode, ownResponse.body).toBe(200);
      expect(ownResponse.json()).toMatchObject({
        store: { id: storeAId, slug: `fixture-rls-a-${runId}` },
      });
      expect(crossStoreResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("uma Loja não altera a linha de outra Loja", async () => {
    const app = appForSyntheticStores();
    try {
      const ownResponse = await app.inject({
        headers: { authorization: "Bearer fixture-a" },
        method: "PATCH",
        payload: { name: `Fixture RLS A atualizada ${runId}` },
        url: `/stores/${storeAId}`,
      });
      const crossStoreResponse = await app.inject({
        headers: { authorization: "Bearer fixture-a" },
        method: "PATCH",
        payload: { name: `Alteração proibida ${runId}` },
        url: `/stores/${storeBId}`,
      });
      const storeBResponse = await app.inject({
        headers: { authorization: "Bearer fixture-b" },
        method: "GET",
        url: `/stores/${storeBId}`,
      });

      expect(ownResponse.statusCode, ownResponse.body).toBe(200);
      expect(crossStoreResponse.statusCode).toBe(404);
      expect(storeBResponse.json()).toMatchObject({
        store: { id: storeBId, name: `Fixture RLS B ${runId}` },
      });
    } finally {
      await app.close();
    }
  });
});
