import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationSql } from "./migration-policy.mjs";

const databasePackageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = resolve(databasePackageRoot, "../..");
const prismaMigrations = resolve(databasePackageRoot, "prisma/migrations");
const supabaseMigrations = resolve(repositoryRoot, "supabase/migrations");
const migrationDirectoryPattern = /^\d{14}_[a-z0-9_]+$/u;

await mkdir(supabaseMigrations, { recursive: true });

const entries = await readdir(prismaMigrations, { withFileTypes: true });
const migrationDirectories = entries
  .filter(
    (entry) => entry.isDirectory() && migrationDirectoryPattern.test(entry.name),
  )
  .sort((left, right) => left.name.localeCompare(right.name));

const migrations = await Promise.all(
  migrationDirectories.map(async (migration) => {
    const source = resolve(prismaMigrations, migration.name, "migration.sql");
    const sql = await readFile(source, "utf8");
    validateMigrationSql(migration.name, sql);
    return { name: migration.name, sql };
  }),
);

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
