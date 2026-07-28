import { readCanonicalMigrations } from "./canonical-migrations.mjs";
import { validateMigrationSql } from "./migration-policy.mjs";

const migrations = await readCanonicalMigrations();
for (const migration of migrations) {
  const { name, sql } = migration;
  validateMigrationSql(name, sql);
}

console.log(`${migrations.length} migrations canônicas validadas.`);
