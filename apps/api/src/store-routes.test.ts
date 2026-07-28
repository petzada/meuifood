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

async function productionDatabaseUrl() {
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
        "Configure SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL ou disponibilize .env e o link local ignorado da Supabase CLI.",
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
  return url.toString();
}

function syntheticTaxId() {
  return [...randomBytes(14)].map((byte) => String(byte % 10)).join("");
}

describe("isolamento de Loja pela API e RLS no Supabase de produção", { timeout: 15_000 }, () => {
  // Em CI, CI_RUN_ID identifica a run inteira, permitindo que a checagem de
  // resíduo global (verify-production-state.mjs) só acuse fixtures desta
  // execução. Fora de CI, cai para um valor aleatório.
  const runId = process.env.CI_RUN_ID ?? randomBytes(8).toString("hex");
  const createdStoreIds: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  const storeAUserId = randomUUID();
  const storeBUserId = randomUUID();
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    const databaseUrl = await productionDatabaseUrl();
    administrativeDatabase = createAdministrativeDatabase(databaseUrl);
    businessDatabase = createBusinessDatabase(databaseUrl);

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
    await administrativeDatabase.storeMember.createMany({
      data: [
        { role: "owner", storeId: storeAId, userId: storeAUserId },
        { role: "owner", storeId: storeBId, userId: storeBUserId },
      ],
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

  function appForSyntheticStores() {
    return buildApp({
      businessDatabase,
      logger: false,
      verifyAccessToken: async (token) => {
        if (token === "fixture-a") return { userId: storeAUserId };
        if (token === "fixture-b") return { userId: storeBUserId };
        throw new Error("invalid_fixture_token");
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
