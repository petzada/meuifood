import pg from "pg";

import { readCanonicalMigrations } from "./canonical-migrations.mjs";
import { productionDatabaseUrl } from "./production-database-url.mjs";
import { assertProductionState } from "./production-state.mjs";

const { Client } = pg;

const localVersions = (await readCanonicalMigrations()).map(
  (migration) => migration.version,
);

const client = new Client({
  connectionString: await productionDatabaseUrl("a verificação"),
});
await client.connect();
try {
  const migrations = await client.query(
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`,
  );
  // A busca é deliberadamente ampla: conta qualquer fixture sintética no banco,
  // não só as desta run. Escopar por CI_RUN_ID deixaria passar justamente o caso
  // que esta checagem existe para pegar — fixture órfã de uma run que crashou ou
  // foi cancelada antes do cleanup. A corrida entre duas runs simultâneas, que
  // motivou a tentativa de escopo, já é resolvida pelo grupo de concorrência do
  // ci.yml, que serializa tudo que toca o banco.
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
