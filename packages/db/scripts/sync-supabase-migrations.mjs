import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

for (const migration of migrationDirectories) {
  const source = resolve(prismaMigrations, migration.name, "migration.sql");
  const target = resolve(supabaseMigrations, `${migration.name}.sql`);
  const sql = await readFile(source, "utf8");
  await writeFile(target, sql, "utf8");
}
