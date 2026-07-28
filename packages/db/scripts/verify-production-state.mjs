import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { readCanonicalMigrations } from "./canonical-migrations.mjs";
import { assertProductionState } from "./production-state.mjs";

const { Client } = pg;
const databasePackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(databasePackageRoot, "../..");

function requiredSecret(source, name) {
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
    const environmentFile = resolve(repositoryRoot, ".env");
    const poolerFile = resolve(repositoryRoot, "supabase/.temp/pooler-url");
    if (!existsSync(environmentFile) || !existsSync(poolerFile)) {
      throw new Error(
        "Configure as credenciais do Supabase de produção para a verificação.",
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

const localVersions = (await readCanonicalMigrations()).map(
  (migration) => migration.version,
);

const client = new Client({ connectionString: await productionDatabaseUrl() });
await client.connect();
try {
  const migrations = await client.query(
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`,
  );
  const residue = await client.query(
    `with fixture_stores as (
       select id
         from public.stores
        where slug like 'fixture-rls-%'
           or slug like 'fixture-rbac-%'
           or slug like 'fixture-preflight-%'
     )
     select
       (select count(*)::integer from fixture_stores) as stores,
       (select count(*)::integer
          from public.store_members member
          join fixture_stores fixture on fixture.id = member.store_id
       ) as memberships`,
  );

  const state = {
    localVersions,
    remoteVersions: migrations.rows.map((row) => row.version),
    residue: residue.rows[0],
  };
  assertProductionState(state);
  console.log(
    `Histórico sincronizado (${localVersions.length} migrations); ` +
      "resíduos sintéticos: 0.",
  );
} finally {
  await client.end();
}
