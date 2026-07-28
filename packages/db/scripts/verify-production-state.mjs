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
  // CI_RUN_ID é o mesmo identificador gravado no sufixo do slug pelas
  // fixtures desta run (ver preflight-production-migrations.ts,
  // store-routes.test.ts e auth-rbac.test.ts). Com duas runs serializadas
  // (grupo de concorrência no ci.yml) não deveria mais haver fixtures de
  // outra run em voo, mas escopar por run_id torna a prova exata: só falha
  // por lixo que esta execução deixou, não por qualquer sintética no banco
  // (ex.: uma run anterior ainda finalizando o afterAll). $1::text is null
  // preserva o comportamento amplo original quando rodado fora de CI.
  const ciRunId = process.env.CI_RUN_ID?.trim() || null;
  const residue = await client.query(
    `with fixture_stores as (
       select id
         from public.stores
        where (
              slug like 'fixture-rls-%'
           or slug like 'fixture-rbac-%'
           or slug like 'fixture-preflight-%'
        )
          and ($1::text is null or slug like '%' || $1)
     )
     select
       (select count(*)::integer from fixture_stores) as stores,
       (select count(*)::integer
          from public.store_members member
          join fixture_stores fixture on fixture.id = member.store_id
       ) as memberships`,
    [ciRunId],
  );

  const state = {
    localVersions,
    remoteVersions: migrations.rows.map((row) => row.version),
    residue: residue.rows[0],
  };
  assertProductionState(state);
  console.log(
    `Histórico sincronizado (${localVersions.length} migrations); ` +
      `resíduos sintéticos: 0${ciRunId ? ` (escopo: run ${ciRunId})` : ""}.`,
  );
} finally {
  await client.end();
}
