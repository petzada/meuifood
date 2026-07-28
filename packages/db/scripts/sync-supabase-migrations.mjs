import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCanonicalMigrations } from "./canonical-migrations.mjs";
import { validateMigrationSql } from "./migration-policy.mjs";

const databasePackageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = resolve(databasePackageRoot, "../..");
const supabaseMigrations = resolve(repositoryRoot, "supabase/migrations");

await mkdir(supabaseMigrations, { recursive: true });

const migrations = await readCanonicalMigrations();
for (const migration of migrations) {
  validateMigrationSql(migration.name, migration.sql);
}

const generatedEntries = await readdir(supabaseMigrations, {
  withFileTypes: true,
});
await Promise.all(
  generatedEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => unlink(resolve(supabaseMigrations, entry.name))),
);

for (const migration of migrations) {
  const target = resolve(supabaseMigrations, `${migration.name}.sql`);
  await writeFile(target, migration.sql, "utf8");
}
