import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  createAdministrativeDatabase,
  createTransactionalBusinessDatabase,
} from "@foode/db";

import { buildApp } from "../src/app.js";
import {
  assertIsolationCatalog,
  pendingCanonicalMigrations,
} from "./migration-preflight-policy.mjs";
import { readCanonicalMigrations } from "../../../packages/db/scripts/canonical-migrations.mjs";
import { validateMigrationSql } from "../../../packages/db/scripts/migration-policy.mjs";

const rollbackProof = new Error("rollback_migration_preflight");

function requiredSecret(source: string, name: string) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`${name} não foi configurada.`);
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
  let password = process.env.SUPABASE_DB_PASSWORD?.trim();
  let pooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (Boolean(password) !== Boolean(pooler)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL devem ser configuradas juntas.",
    );
  }

  if (!password || !pooler) {
    const environmentFile = new URL("../../../.env", import.meta.url);
    const poolerFile = new URL(
      "../../../supabase/.temp/pooler-url",
      import.meta.url,
    );
    if (!existsSync(environmentFile) || !existsSync(poolerFile)) {
      throw new Error(
        "Configure as credenciais do Supabase de produção para o preflight.",
      );
    }
    const [environmentSource, poolerSource] = await Promise.all([
      readFile(environmentFile, "utf8"),
      readFile(poolerFile, "utf8"),
    ]);
    password = requiredSecret(environmentSource, "SUPABASE_DB_PASSWORD");
    pooler = poolerSource.trim();
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

function assertStatus(
  label: string,
  response: { body: string; statusCode: number },
  expected: number,
) {
  if (response.statusCode !== expected) {
    throw new Error(
      `${label}: esperado HTTP ${expected}, recebido ${response.statusCode} ` +
        response.body,
    );
  }
}

const migrations = await readCanonicalMigrations();
for (const migration of migrations) {
  validateMigrationSql(migration.name, migration.sql);
}

const database = createAdministrativeDatabase(await productionDatabaseUrl());
const runId = randomBytes(8).toString("hex");
const fixtureStoreIds: string[] = [];
let pendingCount = 0;
let proofCompleted = false;

try {
  const remoteHistory = await database.$queryRaw<Array<{ version: string }>>`
    SELECT version::text AS version
      FROM supabase_migrations.schema_migrations
     ORDER BY version
  `;
  const pending = pendingCanonicalMigrations(
    migrations,
    remoteHistory.map(({ version }) => version),
  );
  pendingCount = pending.length;

  try {
    await database.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await transaction.$executeRawUnsafe(
          "SET LOCAL statement_timeout = '60s'",
        );

        for (const migration of pending) {
          await transaction.$executeRawUnsafe(migration.sql);
        }

        const [role] = await transaction.$queryRaw<
          Array<{
            bypassRls: boolean;
            inheritsPrivilegedRole: boolean;
            superuser: boolean;
          }>
        >`
          SELECT
            business.rolbypassrls AS "bypassRls",
            business.rolsuper AS superuser,
            EXISTS (
              SELECT 1
                FROM pg_roles privileged
               WHERE (privileged.rolsuper OR privileged.rolbypassrls)
                 AND pg_has_role(
                   'foode_business',
                   privileged.oid,
                   'MEMBER'
                 )
            ) AS "inheritsPrivilegedRole"
          FROM pg_roles business
          WHERE business.rolname = 'foode_business'
        `;
        const tables = await transaction.$queryRaw<
          Array<{
            forceRowSecurity: boolean;
            name: string;
            rowSecurity: boolean;
          }>
        >`
          SELECT
            relname AS name,
            relrowsecurity AS "rowSecurity",
            relforcerowsecurity AS "forceRowSecurity"
          FROM pg_class
          WHERE relnamespace = 'public'::regnamespace
            AND relname IN ('stores', 'store_members')
        `;
        assertIsolationCatalog({ role, tables });

        const storeA = await transaction.store.create({
          data: {
            billingMode: "baas",
            name: `Preflight A ${runId}`,
            slug: `fixture-preflight-a-${runId}`,
            taxId: syntheticTaxId(),
          },
        });
        const storeB = await transaction.store.create({
          data: {
            billingMode: "merchant_own_account",
            name: `Preflight B ${runId}`,
            slug: `fixture-preflight-b-${runId}`,
            taxId: syntheticTaxId(),
          },
        });
        fixtureStoreIds.push(storeA.id, storeB.id);
        const ownerA = randomUUID();
        const ownerB = randomUUID();
        const operatorA = randomUUID();
        await transaction.storeMember.createMany({
          data: [
            { role: "owner", storeId: storeA.id, userId: ownerA },
            { role: "operator", storeId: storeA.id, userId: operatorA },
            { role: "owner", storeId: storeB.id, userId: ownerB },
          ],
        });

        const identities = new Map([
          ["owner-a", ownerA],
          ["operator-a", operatorA],
          ["owner-b", ownerB],
        ]);
        const app = buildApp({
          businessDatabase: createTransactionalBusinessDatabase(transaction),
          logger: false,
          verifyAccessToken: async (token) => {
            const userId = identities.get(token);
            if (!userId) throw new Error("invalid_preflight_token");
            return { userId };
          },
        });

        try {
          const ownRead = await app.inject({
            headers: { authorization: "Bearer owner-a" },
            method: "GET",
            url: `/stores/${storeA.id}`,
          });
          assertStatus("Dono lê a própria Loja", ownRead, 200);

          const crossRead = await app.inject({
            headers: { authorization: "Bearer owner-a" },
            method: "GET",
            url: `/stores/${storeB.id}`,
          });
          assertStatus("RLS nega leitura cross-Loja", crossRead, 404);

          const crossWrite = await app.inject({
            headers: { authorization: "Bearer owner-a" },
            method: "PATCH",
            payload: { name: `Alteração cross-Loja ${runId}` },
            url: `/stores/${storeB.id}`,
          });
          assertStatus("RLS nega escrita cross-Loja", crossWrite, 404);

          const operatorWrite = await app.inject({
            headers: { authorization: "Bearer operator-a" },
            method: "PATCH",
            payload: { name: `Alteração RBAC ${runId}` },
            url: `/stores/${storeA.id}`,
          });
          assertStatus("RBAC nega configuração ao Operador", operatorWrite, 403);

          const persisted = await app.inject({
            headers: { authorization: "Bearer owner-b" },
            method: "GET",
            url: `/stores/${storeB.id}`,
          });
          assertStatus("negações não alteram persistência", persisted, 200);
          if (persisted.json().store.name !== `Preflight B ${runId}`) {
            throw new Error("Preflight alterou a Loja protegida.");
          }
        } finally {
          await app.close();
        }

        proofCompleted = true;
        throw rollbackProof;
      },
      { maxWait: 15_000, timeout: 120_000 },
    );
  } catch (error) {
    if (error !== rollbackProof) throw error;
  }

  if (!proofCompleted) throw new Error("Preflight transacional não concluiu.");
  const residue = await database.store.count({
    where: { id: { in: fixtureStoreIds } },
  });
  if (residue !== 0) {
    throw new Error(`Preflight deixou ${residue} Lojas sintéticas residuais.`);
  }
  console.log(
    `Preflight transacional verde; ${pendingCount} migrations pendentes ` +
      "provadas e revertidas; resíduos: 0.",
  );
} finally {
  await database.$disconnect();
}
