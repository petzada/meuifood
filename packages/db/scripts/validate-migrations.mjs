import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationSql } from "./migration-policy.mjs";

const databasePackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaMigrations = resolve(databasePackageRoot, "prisma/migrations");
const migrationDirectoryPattern = /^(\d{14})_[a-z0-9_]+$/u;

const entries = await readdir(prismaMigrations, { withFileTypes: true });
const migrationDirectories = entries
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

if (migrationDirectories.length === 0) {
  throw new Error("Nenhuma migration Prisma canônica foi encontrada.");
}

const versions = new Set();
for (const migration of migrationDirectories) {
  const match = migrationDirectoryPattern.exec(migration.name);
  if (!match) {
    throw new Error(
      `Diretório de migration inválido: ${migration.name}. ` +
        "Use <timestamp UTC de 14 dígitos>_<slug>.",
    );
  }
  if (versions.has(match[1])) {
    throw new Error(`Timestamp de migration duplicado: ${match[1]}.`);
  }
  versions.add(match[1]);

  const sql = await readFile(
    resolve(prismaMigrations, migration.name, "migration.sql"),
    "utf8",
  );
  validateMigrationSql(migration.name, sql);
}

console.log(`${migrationDirectories.length} migrations canônicas validadas.`);
