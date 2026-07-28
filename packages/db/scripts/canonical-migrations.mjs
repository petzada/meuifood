import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultPrismaMigrationsRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../prisma/migrations",
);

const migrationDirectoryPattern = /^(\d{14})_[a-z0-9_]+$/u;

export async function readCanonicalMigrations(
  migrationsRoot = defaultPrismaMigrationsRoot,
) {
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrationDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  if (migrationDirectories.length === 0) {
    throw new Error("Nenhuma migration Prisma canônica foi encontrada.");
  }

  const versions = new Set();
  return Promise.all(
    migrationDirectories.map(async (migration) => {
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

      return {
        name: migration.name,
        sql: await readFile(
          resolve(migrationsRoot, migration.name, "migration.sql"),
          "utf8",
        ),
        version: match[1],
      };
    }),
  );
}
